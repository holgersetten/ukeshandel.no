import { randomUUID } from 'crypto';
import { getDb } from './db';
import { normalizeTitle } from '../utils/normalizeTitle';
import { classificationInputHash, hashInput, originalInput, offerOccurrenceId } from '../utils/offerOccurrence';
import { PROMPT_VERSION, POLICY_VERSION, MODEL } from '../services/concepts/config';
import type { Assignment, ProductInput, StoredClassification, TaxonomyCategory } from '../services/concepts/types';

export function getTaxonomy(): TaxonomyCategory[] {
  return (getDb().prepare(`SELECT id,name,parent_id AS parentId,facet,definition,assignable,active
    FROM taxonomy_categories ORDER BY id`).all() as TaxonomyCategory[])
    .map(c=>({...c,assignable:!!c.assignable,active:!!c.active}));
}
export function taxonomyVersion(): string { return 'taxonomy-v2:' + hashInput(getTaxonomy()); }
export const promptVersion = () => `${PROMPT_VERSION}:${POLICY_VERSION}`;
export function getClassification(conceptId: string): StoredClassification | null {
  const row = getDb().prepare(`SELECT concept_id AS conceptId, source,manual_lock AS manualLock,
    prompt_version AS promptVersion,taxonomy_version AS taxonomyVersion,model,input_json AS input,
    input_hash AS inputHash,confidence,needs_review AS needsReview,review_reasons_json AS reviewReasons
    FROM concept_classifications WHERE concept_id=?`).get(conceptId) as any;
  if (!row) return null;
  const assignments = getDb().prepare('SELECT category_id AS categoryId,facet,relation FROM concept_categories WHERE concept_id=? ORDER BY category_id').all(conceptId) as Assignment[];
  return {...row,input:JSON.parse(row.input),reviewReasons:JSON.parse(row.reviewReasons),
    manualLock:!!row.manualLock,needsReview:!!row.needsReview,assignments};
}
export function isStale(entry: StoredClassification, input?: ProductInput[]): boolean {
  return !entry.manualLock && (entry.promptVersion !== promptVersion() || entry.taxonomyVersion !== taxonomyVersion()
    || entry.model !== MODEL() || (!!input && entry.inputHash !== classificationInputHash(input)));
}
export function findConcept(offer: ProductInput): string | null {
  const db = getDb(); const name = normalizeTitle(offer.title); const scope = 'offer:' + offerOccurrenceId(offer);
  const local = db.prepare("SELECT concept_id AS id FROM concept_aliases WHERE scope_key=? AND status='approved'").get(scope) as {id:string}|undefined;
  if (local) return local.id;
  const global = db.prepare("SELECT concept_id AS id FROM concept_aliases WHERE normalized_title=? AND scope_key='global' AND status='approved'").get(name) as {id:string}|undefined;
  return global?.id || null;
}
export function ensureConcept(offer: ProductInput): string {
  const db = getDb();
  return db.transaction(() => {
    const existing = findConcept(offer); if (existing) return existing;
    const id = randomUUID();
    db.prepare('INSERT INTO product_concepts(id,canonical_name) VALUES (?,?)').run(id,offer.title);
    db.prepare("INSERT INTO concept_aliases(id,normalized_title,scope_key,concept_id,status) VALUES (?,?,?,?,'approved')")
      .run(randomUUID(),normalizeTitle(offer.title),'offer:'+offerOccurrenceId(offer),id);
    return id;
  })();
}
export function getConcepts() {
  return getDb().prepare('SELECT id,canonical_name AS canonicalName,status FROM product_concepts ORDER BY canonical_name').all();
}
export function getAliases() {
  return getDb().prepare('SELECT id,normalized_title AS normalizedTitle,scope_key AS scopeKey,concept_id AS conceptId,status FROM concept_aliases ORDER BY normalized_title').all();
}
/** Only the explicit authenticated manual endpoint calls this. Never called by AI/fuzzy matching. */
export function approveAlias(title: string, targetId: string, occurrenceId?: string): void {
  const name = normalizeTitle(title); if (!name) throw new Error('Tomt alias');
  const db = getDb();
  db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM product_concepts WHERE id=?').get(targetId)) throw new Error('Ukjent produktkonsept');
    const scope = occurrenceId ? 'offer:'+occurrenceId : 'global';
    if(occurrenceId) {
      const occurrence=db.prepare("SELECT concept_id AS id FROM concept_aliases WHERE scope_key=? AND status='approved'").get(scope) as {id:string}|undefined;
      if(occurrence && occurrence.id!==targetId)throw new Error('Tilbudsforekomsten har allerede en godkjent kobling.');
    }
    const old = db.prepare("SELECT concept_id AS id FROM concept_aliases WHERE normalized_title=? AND scope_key=? AND status='approved'").get(name,scope) as {id:string}|undefined;
    // No implicit replacement/merge: revoke explicitly before changing an existing approved link.
    if (old && old.id !== targetId) throw new Error('Aliaset har allerede en annen godkjent kobling. Avvis den før ny kobling.');
    if (!old) db.prepare("INSERT INTO concept_aliases(id,normalized_title,scope_key,concept_id,status) VALUES (?,?,?,?,'approved')").run(randomUUID(),name,scope,targetId);
    db.prepare("UPDATE product_concepts SET status='confirmed' WHERE id=?").run(targetId);
  })();
}
export function revokeAlias(id: string) {
  if (!getDb().prepare("UPDATE concept_aliases SET status='rejected' WHERE id=?").run(id).changes) throw new Error('Ukjent alias');
}
export function linkOccurrence(offer:ProductInput,targetId:string,approveGlobal=false) {
  const db=getDb();const occurrence=offerOccurrenceId(offer);
  db.transaction(()=>{
    if(!db.prepare('SELECT 1 FROM product_concepts WHERE id=?').get(targetId))throw new Error('Ukjent produktkonsept');
    db.prepare("UPDATE concept_aliases SET status='rejected' WHERE scope_key=? AND status='approved'").run('offer:'+occurrence);
    approveAlias(offer.title,targetId,occurrence);
    if(approveGlobal)approveAlias(offer.title,targetId);
  })();
}
export function assignmentReasons(assignments: Assignment[], taxonomy = getTaxonomy()): string[] {
  if(!Array.isArray(assignments)||assignments.some(a=>!a||typeof a.categoryId!=='string'||typeof a.facet!=='string'||typeof a.relation!=='string'))return ['malformed_assignments'];
  const reasons: string[] = []; const byId = new Map(taxonomy.map(c=>[c.id,c]));
  if (new Set(assignments.map(a=>a.categoryId)).size !== assignments.length) reasons.push('duplicate_category');
  if (assignments.filter(a=>a.facet==='product_type').length !== 1) reasons.push('requires_one_product_type');
  if (assignments.filter(a=>a.facet==='ingredient').length > 1) reasons.push('multiple_primary_ingredients');
  for (const a of assignments) {
    const c = byId.get(a.categoryId);
    if (!c || !c.active || !c.assignable || c.facet !== a.facet) reasons.push('invalid_category');
    if (a.facet==='dish' ? !['is_dish','for_dish'].includes(a.relation) : a.relation!=='') reasons.push('invalid_relation');
    const visited = new Set<string>(); let parent = c?.parentId;
    while (parent) {
      if (visited.has(parent)) { reasons.push('taxonomy_cycle'); break; }
      visited.add(parent);
      if (assignments.some(other=>other.categoryId===parent)) reasons.push('redundant_ancestor');
      parent = byId.get(parent)?.parentId;
    }
  }
  return [...new Set(reasons)];
}
export function saveClassification(conceptId: string, assignments: Assignment[], input: ProductInput[], source:'ai'|'manual',
  confidence: number | null, reasons: string[] = [], expectedVersions = {promptVersion:promptVersion(),taxonomyVersion:taxonomyVersion(),model:MODEL()}): boolean {
  const invalid = assignmentReasons(assignments);
  if (source==='manual' && invalid.length) throw new Error('Ugyldige kategorier: '+invalid.join(', '));
  const review = [...new Set([...reasons,...invalid])];
  if (!input.length && source==='ai') throw new Error('Original produktinformasjon mangler');
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) throw new Error('Ugyldig confidence');
  const db = getDb();
  return db.transaction(() => {
    const previous = getClassification(conceptId);
    if (source==='ai' && previous?.manualLock) return false;
    if (source==='ai' && (expectedVersions.promptVersion!==promptVersion() || expectedVersions.taxonomyVersion!==taxonomyVersion() || expectedVersions.model!==MODEL())) return false;
    // Failed attempts keep previous categories and metadata: no failed result becomes the active result.
    if (source==='ai' && review.length && previous) {
      db.prepare('UPDATE concept_classifications SET needs_review=1,review_reasons_json=? WHERE concept_id=?').run(JSON.stringify(review),conceptId);
      return false;
    }
    db.prepare(`INSERT INTO concept_classifications(concept_id,source,manual_lock,prompt_version,taxonomy_version,model,input_json,input_hash,confidence,needs_review,review_reasons_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(concept_id) DO UPDATE SET source=excluded.source,manual_lock=excluded.manual_lock,
      prompt_version=excluded.prompt_version,taxonomy_version=excluded.taxonomy_version,model=excluded.model,input_json=excluded.input_json,
      input_hash=excluded.input_hash,confidence=excluded.confidence,needs_review=excluded.needs_review,review_reasons_json=excluded.review_reasons_json,updated_at=CURRENT_TIMESTAMP`)
      .run(conceptId,source,source==='manual'?1:0,source==='ai'?expectedVersions.promptVersion:null,
        expectedVersions.taxonomyVersion,source==='ai'?expectedVersions.model:null,JSON.stringify(input),classificationInputHash(input),confidence,Number(!!review.length),JSON.stringify(review));
    db.prepare('DELETE FROM concept_categories WHERE concept_id=?').run(conceptId);
    // Invalid structural output never reaches the database labels.
    if (!review.length) for (const a of assignments) db.prepare('INSERT INTO concept_categories VALUES (?,?,?,?)').run(conceptId,a.categoryId,a.facet,a.relation);
    return true;
  })();
}
export function inputsForConcept(conceptId:string): ProductInput[] { return getClassification(conceptId)?.input || []; }
export function allClassifications(): StoredClassification[] {
  return (getDb().prepare('SELECT concept_id AS id FROM concept_classifications').all() as {id:string}[]).map(r=>getClassification(r.id)!);
}
export function setManual(conceptId:string,assignments:Assignment[],input?:ProductInput[]) {
  const originals=new Map(inputsForConcept(conceptId).map(o=>[o.offerOccurrenceId,o]));
  for(const o of input||[]){const original=originalInput(o);originals.set(original.offerOccurrenceId,original);}
  return saveClassification(conceptId,assignments,[...originals.values()],'manual',null);
}
