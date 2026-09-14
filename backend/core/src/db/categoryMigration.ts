import fs from 'fs';
import type Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { normalizeTitle } from '../utils/normalizeTitle';
import config from '../../../rest/src/config';

type LegacyRow = { product_key: string; main_category: string; sub_category: string; source: string; confidence_main: number; confidence_sub: number };
const idFor = (parent: string | null, name: string) => createHash('sha256').update(JSON.stringify([parent, name])).digest('hex').slice(0, 24);

/** Additive, transactional migration. Legacy rows remain available for audit/recovery. */
export function migrateCategories(db: Database.Database) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, report TEXT NOT NULL)');
  if (db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get('normalized-categories-v1')) {
    const columns = db.prepare('PRAGMA table_info(classifications)').all() as any[];
    if (columns.length && !columns.some(column => column.name === 'attempts')) db.exec('ALTER TABLE classifications ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0');
    return;
  }
  const hasLegacy = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='category_cache'").get();
  const legacy = hasLegacy ? db.prepare('SELECT * FROM category_cache').all() as LegacyRow[] : [];
  if (legacy.length && db.name !== ':memory:') {
    const backup = db.name + '.before-normalized-' + Date.now() + '.db';
    db.prepare('VACUUM INTO ?').run(backup);
    console.log('Sikkerhetskopi før migrering: ' + backup);
  }
  db.transaction(() => {
    // Another server may have completed migration while this connection took its backup.
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get('normalized-categories-v1')) return;
    db.exec(`
      CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT);
      CREATE UNIQUE INDEX category_siblings ON categories(COALESCE(parent_id, ''), name);
      CREATE TABLE classifications (
        normalized_name TEXT PRIMARY KEY, source TEXT NOT NULL, needs_review INTEGER NOT NULL DEFAULT 0,
        confidence REAL, review_reason TEXT, attempts INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE classification_categories (
        normalized_name TEXT NOT NULL REFERENCES classifications(normalized_name) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY(normalized_name, category_id)
      );
      CREATE TABLE category_migration_conflicts (normalized_name TEXT PRIMARY KEY, legacy_rows TEXT NOT NULL);
    `);
    if (!db.prepare('PRAGMA table_info(classifications)').all().some((column: any) => column.name === 'attempts')) {
      db.exec('ALTER TABLE classifications ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0');
    }
    const add = (name: string, parent: string | null) => {
      const id = idFor(parent, name);
      db.prepare('INSERT OR IGNORE INTO categories(id,name,parent_id) VALUES (?,?,?)').run(id, name, parent);
      return id;
    };
    const hierarchy = JSON.parse(fs.readFileSync(config.categoriesFile, 'utf8')) as Record<string, string[]>;
    for (const [main, subs] of Object.entries(hierarchy)) {
      if (main === 'Ukategorisert') continue;
      const parent = add(main, null);
      for (const sub of subs) add(sub, parent);
    }
    // Cross-cutting category, independent of the existing Middag hierarchy.
    add('Vegetar', null);
    const grouped = new Map<string, LegacyRow[]>();
    for (const row of legacy) {
      const parts = row.product_key.split('|');
      const name = normalizeTitle(parts.slice(0, parts.length >= 4 ? -3 : -1).join('|'));
      if (!name) throw new Error('Kan ikke migrere tomt varenavn: ' + row.product_key);
      grouped.set(name, [...(grouped.get(name) || []), row]);
    }
    let conflicts = 0;
    let manual = 0;
    for (const [name, rows] of grouped) {
      const manualRows = rows.filter(row => row.source === 'manual');
      const candidates = manualRows.length ? manualRows : rows;
      const ids = candidates.map(row => {
        if (row.main_category === 'Ukategorisert' || row.sub_category === 'Ukategorisert') return null;
        const parent = add(row.main_category, null);
        return row.sub_category ? add(row.sub_category, parent) : parent;
      });
      const different = new Set(ids).size > 1;
      const direct = [...new Set(ids.filter((id): id is string => !!id))];
      const uncertain = candidates.some(row => row.confidence_main < .90 || row.confidence_sub < .88);
      const needsReview = different || !direct.length || (!manualRows.length && uncertain);
      if (different) {
        conflicts++;
        db.prepare('INSERT INTO category_migration_conflicts VALUES (?,?)').run(name, JSON.stringify(rows));
      }
      if (manualRows.length) manual++;
      db.prepare('INSERT INTO classifications(normalized_name,source,needs_review,review_reason) VALUES (?,?,?,?)')
        .run(name, manualRows.length ? 'manual' : 'ai', Number(needsReview), different ? 'Motstridende eldre kategoriseringer' : needsReview ? 'Krever kontroll etter migrering' : null);
      for (const id of direct) db.prepare('INSERT INTO classification_categories VALUES (?,?)').run(name, id);
    }
    const report = { legacyRows: legacy.length, normalizedNames: grouped.size, mergedRows: legacy.length - grouped.size, manualNames: manual, conflicts };
    db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run('normalized-categories-v1', JSON.stringify(report));
    console.log('Kategorimigrering:', report);
  })();
}
