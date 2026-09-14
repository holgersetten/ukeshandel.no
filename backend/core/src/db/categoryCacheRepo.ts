import { getDb } from './db';
import { normalizeTitle } from '../utils/normalizeTitle';
import { directCategories } from '../config/categories';

export interface Classification {
  normalizedName: string;
  categoryIds: string[];
  source: 'manual' | 'ai';
  needsReview: boolean;
  confidence: number | null;
  reviewReason: string | null;
  attempts: number;
}
export function get(normalizedName: string): Classification | null {
  const db = getDb();
  const row = db.prepare('SELECT normalized_name AS normalizedName, source, needs_review AS needsReview, confidence, review_reason AS reviewReason, attempts FROM classifications WHERE normalized_name=?').get(normalizedName) as Omit<Classification,'categoryIds'> | undefined;
  if (!row) return null;
  const categoryIds = (db.prepare('SELECT category_id AS id FROM classification_categories WHERE normalized_name=? ORDER BY category_id').all(normalizedName) as {id:string}[]).map(c=>c.id);
  return { ...row, needsReview: !!row.needsReview, categoryIds };
}
export function getAll(): Classification[] {
  return (getDb().prepare('SELECT normalized_name AS name FROM classifications ORDER BY normalized_name').all() as {name:string}[]).map(row => get(row.name)!);
}
export function remove(normalizedName: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM classification_categories WHERE normalized_name=?').run(normalizedName);
    db.prepare('DELETE FROM classifications WHERE normalized_name=?').run(normalizedName);
  })();
}
export function save(name: string, ids: string[], source: 'manual'|'ai', confidence: number | null = null, reason: string | null = null): void {
  if (!name || normalizeTitle(name) !== name) throw new Error('Ugyldig normalizedName');
  const direct = ids.length ? directCategories(ids) : [];
  const db = getDb();
  db.transaction(() => {
    // An AI response must never replace an existing manual correction or cached result.
    if (source === 'ai' && get(name)) return;
    const needsReview = !!reason || !direct.length || (source === 'ai' && (confidence === null || confidence < .9));
    db.prepare(`INSERT INTO classifications(normalized_name,source,needs_review,confidence,review_reason,attempts) VALUES (?,?,?,?,?,?)
      ON CONFLICT(normalized_name) DO UPDATE SET source=excluded.source,needs_review=excluded.needs_review,confidence=excluded.confidence,review_reason=excluded.review_reason,attempts=classifications.attempts + excluded.attempts,updated_at=CURRENT_TIMESTAMP`)
      .run(name, source, Number(needsReview), confidence, reason, source === 'ai' ? 1 : 0);
    db.prepare('DELETE FROM classification_categories WHERE normalized_name=?').run(name);
    for (const id of direct) db.prepare('INSERT INTO classification_categories VALUES (?,?)').run(name,id);
  })();
}
