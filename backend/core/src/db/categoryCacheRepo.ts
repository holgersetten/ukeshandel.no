import { getDb } from './db';

/**
 * Database row format (snake_case)
 */
interface CategoryCacheRow {
    product_key: string;
    main_category: string;
    sub_category: string;
    ingredient_key: string;
    source: string;
    confidence_main: number;
    confidence_sub: number;
    confidence_ingredient: number;
    cache_status?: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Application format (camelCase med nested confidence)
 */
export interface CategoryCacheData {
    mainCategory: string;
    subCategory: string;
    ingredientKey: string;
    source: string;
    confidence: {
        main: number;
        sub: number;
        ingredientKey: number;
    };
    cacheStatus?: string;
    timestamp?: string;
}

/**
 * Konverterer DB row til app format
 */
function rowToData(row: CategoryCacheRow): CategoryCacheData {
    return {
        mainCategory: row.main_category,
        subCategory: row.sub_category,
        ingredientKey: row.ingredient_key,
        source: row.source,
        confidence: {
            main: row.confidence_main,
            sub: row.confidence_sub,
            ingredientKey: row.confidence_ingredient
        },
        cacheStatus: row.cache_status || undefined,
        timestamp: row.updated_at
    };
}

/**
 * Henter category cache entry for gitt product key
 * @returns CategoryCacheData eller null hvis ikke funnet
 */
export function get(productKey: string): CategoryCacheData | null {
    const db = getDb();
    
    const stmt = db.prepare<[string, string], CategoryCacheRow>(
        `SELECT * FROM category_cache WHERE product_key = ?
         OR product_key IN (SELECT legacy_key FROM product_key_aliases WHERE product_key = ?)
         ORDER BY CASE WHEN source = 'manual' THEN 0 ELSE 1 END, updated_at DESC LIMIT 1`
    );
    
    const row = stmt.get(productKey, productKey);
    return row ? rowToData(row) : null;
}

/**
 * Henter alle category cache entries
 * @returns Record<productKey, CategoryCacheData>
 */
export function getAll(): Record<string, CategoryCacheData> {
    const db = getDb();
    
    const stmt = db.prepare<[], CategoryCacheRow>(
        'SELECT * FROM category_cache'
    );
    
    const rows = stmt.all();
    const result: Record<string, CategoryCacheData> = {};
    
    for (const row of rows) {
        result[row.product_key] = rowToData(row);
    }
    
    return result;
}

/**
 * Setter/oppdaterer category cache entry (UPSERT)
 */
export function upsert(productKey: string, data: CategoryCacheData): void {
    const db = getDb();
    
    const stmt = db.prepare(`
        INSERT INTO category_cache (
            product_key,
            main_category,
            sub_category,
            ingredient_key,
            source,
            confidence_main,
            confidence_sub,
            confidence_ingredient,
            cache_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(product_key) DO UPDATE SET
            main_category = excluded.main_category,
            sub_category = excluded.sub_category,
            ingredient_key = excluded.ingredient_key,
            source = excluded.source,
            confidence_main = excluded.confidence_main,
            confidence_sub = excluded.confidence_sub,
            confidence_ingredient = excluded.confidence_ingredient,
            cache_status = excluded.cache_status
    `);
    
    stmt.run(
        productKey,
        data.mainCategory,
        data.subCategory,
        data.ingredientKey,
        data.source,
        data.confidence.main,
        data.confidence.sub,
        data.confidence.ingredientKey,
        data.cacheStatus || null
    );
}

/**
 * Sletter en cache entry
 */
export function remove(productKey: string): void {
    const db = getDb();
    const stmt = db.prepare('DELETE FROM category_cache WHERE product_key = ?');
    stmt.run(productKey);
}

/**
 * Sletter alle cache entries (for testing/reset)
 */
export function clear(): void {
    const db = getDb();
    db.prepare('DELETE FROM category_cache').run();
}

/**
 * Teller antall entries i cache
 */
export function count(): number {
    const db = getDb();
    const result = db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM category_cache').get();
    return result?.count || 0;
}
