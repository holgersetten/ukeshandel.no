import { randomUUID } from 'crypto';
import fs from 'node:fs';
import { getDb } from '../db/db';
import config from '../../../rest/src/config';

export interface Category { id: string; name: string; parentId: string | null }

let configuredOrder: Map<string, number> | undefined;

export function getCategories(): Category[] {
  if (!configuredOrder) {
    const tree = JSON.parse(fs.readFileSync(config.categoriesFile, 'utf8')) as Record<string, string[]>;
    configuredOrder = new Map(Object.entries(tree)
      .flatMap(([parent, children]) => [[null, parent], ...children.map(child => [parent, child])])
      .map((path, index) => [JSON.stringify(path), index]));
  }
  const order = configuredOrder;
  const categories = getDb()
    .prepare('SELECT id,name,parent_id AS parentId FROM categories ORDER BY name,id')
    .all() as Category[];
  const names = new Map(categories.map(category => [category.id, category.name]));
  const position = (category: Category) => order.get(JSON.stringify([
    category.parentId === null ? null : names.get(category.parentId), category.name,
  ])) ?? order.size;
  return categories.sort((a, b) => position(a) - position(b));
}

// ta imot kategori-ID-er og returnere dem sammen med alle foreldrekategoriers ID-er (overordnet kategori, f.eks Meieri <- Melk)
export function withAncestors(ids: string[], categories = getCategories()): string[] {

  const byId = new Map(categories.map(c => [c.id, c]));
  const result = new Set<string>();

  for (const id of ids) {

    let current: string | null = id;

    // seen hindrer uendelig løkke
    const seen = new Set<string>();

    while (current) {

      if (seen.has(current)) throw new Error('Syklus i kategorihierarkiet');
      seen.add(current);

      const category = byId.get(current);

      if (!category) throw new Error('Ukjent kategori: ' + current);

      result.add(current);
      current = category.parentId;
    }
  }

  return [...result];
}

// validere kategori-ID-er og fjerne overflødige foreldrekategorier
export function directCategories(value: unknown, max = 3, categories = getCategories()): string[] {

  if (!Array.isArray(value) || !value.length || value.length > max || value.some(id => typeof id !== 'string')) {
    throw new Error('Velg 1–' + max + ' kategorier');
  }

  if (new Set(value).size !== value.length) throw new Error('Dupliserte kategorier');

  withAncestors(value, categories);

  return value.filter(id => !value.some(other => other !== id && withAncestors([other], categories).includes(id)));
}


export function saveCategory(id: string | undefined, name: unknown, parentId: unknown): Category {

  // VALIDERING
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) 
    throw new Error('Ugyldig kategorinavn');

  if (parentId !== null && typeof parentId !== 'string') 
    throw new Error('Ugyldig parentId');

  const all = getCategories();

  if (id && !all.some(c => c.id === id)) 
    throw new Error('Kategorien finnes ikke');

  const key = id || randomUUID();

  if (parentId && withAncestors([parentId], all).includes(key)) 
    throw new Error('En kategori kan ikke være sin egen forelder');

  if (parentId === key) 
    throw new Error('En kategori kan ikke være sin egen forelder');

  if (all.some(c => c.id !== key && c.parentId === parentId && c.name.toLowerCase() === name.trim().toLowerCase())) 
    throw new Error('Kategorien finnes allerede under denne forelderen');

  // LAGRING I SQLITE
  const db = getDb();
  
  // upsert
  db.transaction(() => {
    db.prepare('INSERT INTO categories(id,name,parent_id) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id')
      .run(key, name.trim(), parentId);

    // Fjerner overflødige kategorikoblinger etter endringer i hierarkiet
    for (const row of db.prepare('SELECT DISTINCT normalized_name AS name FROM classification_categories').all() as {name:string}[]) {
      
      const ids = (db.prepare('SELECT category_id AS id FROM classification_categories WHERE normalized_name=?').all(row.name) as {id:string}[]).map(c=>c.id);
      const direct = directCategories(ids, Number.MAX_SAFE_INTEGER);
      
      for (const obsolete of ids.filter(cid=>!direct.includes(cid))) db.prepare('DELETE FROM classification_categories WHERE normalized_name=? AND category_id=?').run(row.name, obsolete);
    }

  })();

  return { 
    id: key, 
    name: name.trim(), 
    parentId: parentId as string | null };
}


export function deleteCategory(id: string): void {

  const db = getDb();

  if (!getCategories().some(c => c.id === id)) 
    throw new Error('Kategorien finnes ikke');

  if (getCategories().some(c => c.parentId === id)) 
    throw new Error('Flytt eller slett underkategoriene først');
  
  db.transaction(() => {

    db.prepare("UPDATE classifications SET needs_review=1,review_reason='Kategori slettet' WHERE normalized_name IN (SELECT normalized_name FROM classification_categories WHERE category_id=?)")
      .run(id);

    db.prepare('DELETE FROM categories WHERE id=?')
      .run(id);
  })();
}
