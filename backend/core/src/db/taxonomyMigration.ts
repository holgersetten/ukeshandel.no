import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import config from '../../../rest/src/config';
import { hashInput } from '../utils/offerOccurrence';
import type { TaxonomyCategory } from '../services/concepts/types';

export const TAXONOMY_MIGRATION = 'taxonomy-v2.2';
const resources = () => path.dirname(config.categoriesFile);
export const taxonomySeedFile = () => process.env.TAXONOMY_FILE || path.join(resources(), 'taxonomy.v2.1.json');

export function taxonomyRows(db: Database.Database): TaxonomyCategory[] {
  return (db.prepare(`SELECT id,name,parent_id AS parentId,facet,definition,assignable,active
    FROM taxonomy_categories ORDER BY id`).all() as TaxonomyCategory[])
    .map(c => ({...c, assignable: !!c.assignable, active: !!c.active}));
}

/** Check every column, including metadata/timestamps, in both classification systems. */
export function classificationSnapshot(db: Database.Database) {
  return {
    concepts: db.prepare('SELECT * FROM concept_classifications ORDER BY concept_id').all(),
    assignments: db.prepare('SELECT * FROM concept_categories ORDER BY concept_id,category_id').all(),
    legacy: db.prepare('SELECT * FROM classifications ORDER BY normalized_name').all(),
    legacyAssignments: db.prepare('SELECT * FROM classification_categories ORDER BY normalized_name,category_id').all(),
  };
}

function backup(db: Database.Database, suffix: string): string | null {
  if (db.name === ':memory:') return null;
  const filename = db.name + '.' + suffix + '-' + Date.now() + '.db';
  // SQLite includes committed WAL content; a plain filesystem copy would not.
  db.prepare('VACUUM INTO ?').run(filename);
  return filename;
}

function ordered(categories: TaxonomyCategory[]): TaxonomyCategory[] {
  const pending = [...categories]; const result: TaxonomyCategory[] = []; const seen = new Set<string>();
  if (new Set(pending.map(c => c.id)).size !== pending.length) throw new Error('Dupliserte taksonomi-ID-er');
  while (pending.length) {
    const index = pending.findIndex(c => !c.parentId || seen.has(c.parentId));
    if (index < 0) throw new Error('Ugyldig taksonomihierarki');
    const [c] = pending.splice(index, 1);
    const parent = result.find(p => p.id === c.parentId);
    if (parent && (parent.facet !== c.facet || (c.active && !parent.active))) throw new Error('Ugyldig taksonomiforelder');
    result.push(c); seen.add(c.id);
  }
  return result;
}

function writeCategories(db: Database.Database, categories: TaxonomyCategory[]) {
  const save = db.prepare(`INSERT INTO taxonomy_categories(id,name,parent_id,facet,definition,assignable,active)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    name=excluded.name,parent_id=excluded.parent_id,definition=excluded.definition,
    assignable=excluded.assignable,active=excluded.active`);
  for (const c of ordered(categories)) {
    const existing = db.prepare('SELECT facet FROM taxonomy_categories WHERE id=?').get(c.id) as {facet:string}|undefined;
    if (existing && existing.facet !== c.facet) throw new Error('Eksisterende kategori-ID kan ikke endre facet: ' + c.id);
    save.run(c.id,c.name,c.parentId,c.facet,c.definition,Number(c.assignable),Number(c.active));
  }
}

export function migrateTaxonomyV22(db: Database.Database) {
  const oldReport = db.prepare('SELECT report FROM schema_migrations WHERE name=?').get(TAXONOMY_MIGRATION) as {report:string}|undefined;
  if (oldReport) return {...JSON.parse(oldReport.report), alreadyApplied: true};
  const oldSeed = JSON.parse(fs.readFileSync(path.join(resources(), 'taxonomy.v2.1.json'), 'utf8'));
  const targetSeed = JSON.parse(fs.readFileSync(path.join(resources(), 'taxonomy.v2.json'), 'utf8'));
  if (oldSeed.version !== 'taxonomy-v2.1' || targetSeed.version !== TAXONOMY_MIGRATION) throw new Error('Uventet taksonomiversjon');
  const target = targetSeed.categories as TaxonomyCategory[];
  ordered(target);
  const before = taxonomyRows(db);
  // Do not silently overwrite user-edited taxonomy definitions or hierarchy.
  for (const original of oldSeed.categories as TaxonomyCategory[]) {
    const existing = before.find(c => c.id === original.id);
    if (!existing || hashInput(existing) !== hashInput({...original, active: true})) {
      throw new Error('Taksonomien avviker fra v2.1; avklar før migrering: ' + original.id);
    }
  }
  for (const c of target.filter(c => !oldSeed.categories.some((old:TaxonomyCategory) => old.id === c.id))) {
    if (before.some(old => old.id === c.id)) throw new Error('Ny kategori-ID finnes allerede: ' + c.id);
  }
  const backupPath = backup(db, 'before-taxonomy-v2.2');
  return db.transaction(() => {
    const classifications = hashInput(classificationSnapshot(db));
    writeCategories(db, target);
    if (hashInput(classificationSnapshot(db)) !== classifications) throw new Error('Migreringen endret klassifiseringer');
    if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Migreringen brøt fremmednøkler');
    const after = taxonomyRows(db);
    const report = {
      version: TAXONOMY_MIGRATION, backup: backupPath,
      beforeCount: before.length, afterCount: after.length,
      active: after.filter(c => c.active).length,
      assignable: after.filter(c => c.active && c.assignable).length,
      classificationsUnchanged: true, classificationsHash: classifications,
      beforeTaxonomy: before, afterTaxonomyHash: hashInput(after),
    };
    db.prepare('INSERT INTO schema_migrations(name,report) VALUES (?,?)').run(TAXONOMY_MIGRATION, JSON.stringify(report));
    return report;
  })();
}

/** Taxonomy-only rollback. Refuse to discard new decisions or later taxonomy edits. */
export function rollbackTaxonomyV22(db: Database.Database) {
  const row = db.prepare('SELECT report FROM schema_migrations WHERE name=?').get(TAXONOMY_MIGRATION) as {report:string}|undefined;
  if (!row) throw new Error('taxonomy-v2.2 er ikke migrert');
  const report = JSON.parse(row.report);
  const current = taxonomyRows(db);
  if (hashInput(current) !== report.afterTaxonomyHash) throw new Error('Taksonomien er endret etter migreringen; automatisk tilbakeføring avbrytes');
  const before = report.beforeTaxonomy as TaxonomyCategory[];
  const added = current.filter(c => !before.some(old => old.id === c.id));
  for (const c of added) {
    if (db.prepare('SELECT 1 FROM concept_categories WHERE category_id=?').get(c.id)) {
      throw new Error('Ny kategori er tatt i bruk; tilbakeføring ville miste avgjørelser: ' + c.id);
    }
  }
  const backupPath = backup(db, 'before-taxonomy-v2.2-rollback');
  return db.transaction(() => {
    const classifications = hashInput(classificationSnapshot(db));
    writeCategories(db, before);
    const remove = db.prepare('DELETE FROM taxonomy_categories WHERE id=?');
    for (const c of ordered(current).reverse().filter(c => added.some(a => a.id === c.id))) remove.run(c.id);
    if (hashInput(classificationSnapshot(db)) !== classifications || (db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Utrygg tilbakeføring');
    db.prepare('DELETE FROM schema_migrations WHERE name=?').run(TAXONOMY_MIGRATION);
    return {version:'taxonomy-v2.1', backup:backupPath, count:before.length, classificationsUnchanged:true};
  })();
}
