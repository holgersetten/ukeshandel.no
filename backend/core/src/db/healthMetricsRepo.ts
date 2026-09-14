import { getDb } from './db';

const db = getDb();

export interface WeeklyUpdateMetrics {
    id?: number;
    timestamp: string;
    duration: number; // milliseconds
    totalOffers: number;
    totalNormalizedNames: number; // antall unike produkter totalt
    offersPerStore: Record<string, number>;
    newNormalizedNames: number;
    cacheHitRate: number;
    pendingRate: number;
    errors: Record<string, string>; // store -> error message
    success: boolean;
}

// Lagre metrics fra weekly-update
export function saveWeeklyUpdateMetrics(metrics: WeeklyUpdateMetrics): void {
    db.prepare(`
        INSERT INTO health_metrics (
            timestamp, duration, totalOffers, totalProductKeys, offersPerStore, 
            newProductKeys, cacheHitRate, pendingRate, errors, success
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        metrics.timestamp,
        metrics.duration,
        metrics.totalOffers,
        metrics.totalNormalizedNames,
        JSON.stringify(metrics.offersPerStore),
        metrics.newNormalizedNames,
        metrics.cacheHitRate,
        metrics.pendingRate,
        JSON.stringify(metrics.errors),
        metrics.success ? 1 : 0
    );
}

// Hent siste weekly-update metrics
export function getLatestWeeklyUpdateMetrics(): WeeklyUpdateMetrics | null {
    const row = db.prepare(`
        SELECT * FROM health_metrics 
        ORDER BY timestamp DESC 
        LIMIT 1
    `).get() as any;

    if (!row) return null;

    return {
        id: row.id,
        timestamp: row.timestamp,
        duration: row.duration,
        totalOffers: row.totalOffers,
        totalNormalizedNames: row.totalProductKeys,
        offersPerStore: JSON.parse(row.offersPerStore),
        newNormalizedNames: row.newProductKeys,
        cacheHitRate: row.cacheHitRate,
        pendingRate: row.pendingRate,
        errors: JSON.parse(row.errors),
        success: row.success === 1
    };
}

// Hent alle metrics (for historikk)
export function getAllWeeklyUpdateMetrics(limit: number = 10): WeeklyUpdateMetrics[] {
    const rows = db.prepare(`
        SELECT * FROM health_metrics 
        ORDER BY timestamp DESC 
        LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        duration: row.duration,
        totalOffers: row.totalOffers,
        totalNormalizedNames: row.totalProductKeys,
        offersPerStore: JSON.parse(row.offersPerStore),
        newNormalizedNames: row.newProductKeys,
        cacheHitRate: row.cacheHitRate,
        pendingRate: row.pendingRate,
        errors: JSON.parse(row.errors),
        success: row.success === 1
    }));
}
