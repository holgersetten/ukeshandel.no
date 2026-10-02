import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import config from '../../../rest/src/config';
import { hashInput, originalInput } from '../utils/offerOccurrence';
import { normalizeTitle } from '../utils/normalizeTitle';
import type { ProductInput } from '../services/concepts/types';

export const CONCEPT_MIGRATION = 'product-concepts-v1';
export const taxonomyFile = () => process.env.TAXONOMY_FILE || path.join(path.dirname(config.categoriesFile), 'taxonomy.v2.json');

/** Additive only: old tables and JSON files are never modified. */
export function migrateConcepts(db: Database.Database) {
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(CONCEPT_MIGRATION)) return;
  let backup: string | null = null;
  if (db.name !== ':memory:') {
    backup = db.name + '.before-concepts-' + Date.now() + '.db';
    db.prepare('VACUUM INTO ?').run(backup);
  }
  db.transaction(() => {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(CONCEPT_MIGRATION)) return;
    db.exec(`
      CREATE TABLE taxonomy_categories (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT,
        facet TEXT NOT NULL CHECK(facet IN ('product_type','ingredient','dish','dietary','usage')),
        definition TEXT NOT NULL, assignable INTEGER NOT NULL CHECK(assignable IN (0,1)),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), UNIQUE(id,facet),
        FOREIGN KEY(parent_id,facet) REFERENCES taxonomy_categories(id,facet)
      );
      CREATE TABLE product_concepts (
        id TEXT PRIMARY KEY, canonical_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'provisional' CHECK(status IN ('provisional','confirmed')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE concept_aliases (
        id TEXT PRIMARY KEY, normalized_title TEXT NOT NULL, scope_key TEXT NOT NULL,
        concept_id TEXT NOT NULL REFERENCES product_concepts(id),
        status TEXT NOT NULL CHECK(status IN ('proposed','approved','rejected')),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX one_approved_concept_alias ON concept_aliases(normalized_title,scope_key) WHERE status='approved';
      CREATE INDEX concept_alias_lookup ON concept_aliases(normalized_title,status);
      CREATE TABLE concept_classifications (
        concept_id TEXT PRIMARY KEY REFERENCES product_concepts(id),
        source TEXT NOT NULL CHECK(source IN ('ai','manual')),
        manual_lock INTEGER NOT NULL DEFAULT 0 CHECK(manual_lock IN (0,1)),
        prompt_version TEXT, taxonomy_version TEXT NOT NULL, model TEXT,
        input_json TEXT NOT NULL, input_hash TEXT NOT NULL, confidence REAL,
        needs_review INTEGER NOT NULL CHECK(needs_review IN (0,1)), review_reasons_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK(source<>'manual' OR manual_lock=1),
        CHECK(source<>'ai' OR (prompt_version IS NOT NULL AND model IS NOT NULL)),
        CHECK(confidence IS NULL OR confidence BETWEEN 0 AND 1)
      );
      CREATE TABLE concept_categories (
        concept_id TEXT NOT NULL REFERENCES concept_classifications(concept_id) ON DELETE CASCADE,
        category_id TEXT NOT NULL, facet TEXT NOT NULL, relation TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(concept_id,category_id),
        FOREIGN KEY(category_id,facet) REFERENCES taxonomy_categories(id,facet),
        CHECK((facet='dish' AND relation IN ('is_dish','for_dish')) OR
          (facet IN ('product_type','ingredient','dietary','usage') AND relation=''))
      );
      CREATE UNIQUE INDEX concept_one_product_type ON concept_categories(concept_id) WHERE facet='product_type';
      CREATE UNIQUE INDEX concept_one_ingredient ON concept_categories(concept_id) WHERE facet='ingredient';
    `);
    const seed = JSON.parse(fs.readFileSync(taxonomyFile(), 'utf8'));
    const insertCategory = db.prepare('INSERT INTO taxonomy_categories(id,name,parent_id,facet,definition,assignable) VALUES (?,?,?,?,?,?)');
    // Parent-first topological insertion with explicit cycle detection.
    const pending = [...seed.categories]; const inserted = new Set<string>();
    while (pending.length) {
      const index = pending.findIndex(c => !c.parentId || inserted.has(c.parentId));
      if (index < 0) throw new Error('Ugyldig taksonomihierarki');
      const [c] = pending.splice(index,1);
      insertCategory.run(c.id,c.name,c.parentId,c.facet,c.definition,Number(c.assignable)); inserted.add(c.id);
    }
    // Legacy history with no input is preserved, but can never be retried from a fabricated title.
    const originalByName = new Map<string,ProductInput[]>();
    if (fs.existsSync(config.offersDir)) for (const file of fs.readdirSync(config.offersDir).filter(f => f.endsWith('_offers.json'))) {
      for (const offer of JSON.parse(fs.readFileSync(path.join(config.offersDir,file),'utf8')) as ProductInput[]) {
        try {
          const input = originalInput(offer); const name = normalizeTitle(input.title);
          originalByName.set(name,[...(originalByName.get(name) || []),input]);
        } catch { /* The old flow retains occurrences without enough source identity. */ }
      }
    }
    const legacy = db.prepare('SELECT * FROM classifications').all() as any[];
    let manual = 0; let conflicts = 0;
    for (const row of legacy) {
      const conceptId = 'legacy_' + hashInput(row.normalized_name);
      db.prepare('INSERT INTO product_concepts(id,canonical_name) VALUES (?,?)').run(conceptId,row.normalized_name);
      const input = originalByName.get(row.normalized_name) || [];
      // Import scoped links only. Legacy titles never become global aliases automatically.
      for (const offer of input) {
        db.prepare("INSERT OR IGNORE INTO concept_aliases(id,normalized_title,scope_key,concept_id,status) VALUES (?,?,?,?,'approved')")
          .run(hashInput([conceptId,offer.offerOccurrenceId]),row.normalized_name,'offer:'+offer.offerOccurrenceId,conceptId);
      }
      const oldIds = (db.prepare('SELECT category_id AS id FROM classification_categories WHERE normalized_name=?').all(row.normalized_name) as {id:string}[]).map(r=>r.id);
      const mapped = oldIds.map(id => db.prepare('SELECT * FROM taxonomy_categories WHERE id=? AND active=1 AND assignable=1').get(id) as any).filter(Boolean);
      const compatible = mapped.length === oldIds.length && mapped.filter(c=>c.facet==='product_type').length === 1;
      const reasons = [row.needs_review ? 'legacy_review' : '', !compatible ? 'legacy_taxonomy_conflict' : '', !input.length ? 'missing_original_input' : '', row.source==='ai' ? 'legacy_ai_stale' : ''].filter(Boolean);
      if (!compatible) conflicts++;
      if (row.source==='manual') manual++;
      db.prepare(`INSERT INTO concept_classifications(concept_id,source,manual_lock,prompt_version,taxonomy_version,model,input_json,input_hash,confidence,needs_review,review_reasons_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(conceptId,row.source,row.source==='manual'?1:0,row.source==='ai'?'legacy':null,
          'legacy-v1',row.source==='ai'?'unknown':null,JSON.stringify(input),hashInput(input),row.confidence,Number(!!reasons.length),JSON.stringify(reasons));
      if (compatible) for (const c of mapped) db.prepare('INSERT INTO concept_categories VALUES (?,?,?,?)').run(conceptId,c.id,c.facet,'');
    }
    db.prepare('INSERT INTO schema_migrations(name,report) VALUES (?,?)')
      .run(CONCEPT_MIGRATION,JSON.stringify({backup,concepts:legacy.length,manual,conflicts,taxonomySeed:seed.version}));
  })();
}
