import offerService from './offerService';
import categoryService from './categoryService';
import { saveWeeklyUpdateMetrics } from '../db/healthMetricsRepo';

export interface UpdateResult {
    success: boolean;
    timestamp: string;
    duration: number;
    pendingCount: number;
    totalOffers: number;
    newNormalizedNames: number;
    errors: Record<string, string>;
    message: string;
}

/** Én pågående jobb deles av samtidige API-kall. */
let ongoingUpdate: Promise<UpdateResult> | null = null;

export function updateOffers(): Promise<UpdateResult> {
    if (!ongoingUpdate) {
        ongoingUpdate = runUpdate().finally(() => { ongoingUpdate = null; });
    }
    return ongoingUpdate;
}

async function runUpdate(): Promise<UpdateResult> {
    const started = Date.now();
    const timestamp = new Date().toISOString();
    const errors: Record<string, string> = {};
    try {
        const existing = new Set((await offerService.getAllOffers()).map(o => o.normalizedName));
        const fetched = await offerService.updateAllStoreOffersWithTracking();
        Object.assign(errors, fetched.errors);

        await categoryService.categorizeOffers(await offerService.getAllOffers());

        const offers = await offerService.getAllOffers();
        const keys = new Set(offers.map(o => o.normalizedName));
        const newNormalizedNames = [...keys].filter(key => !existing.has(key)).length;
        const pendingCount = categoryService.getPendingCount();
        const stats = categoryService.getCacheStatistics();
        const success = Object.keys(errors).length === 0;
        const duration = Date.now() - started;
        saveWeeklyUpdateMetrics({
            timestamp, duration, totalOffers: offers.length, totalNormalizedNames: keys.size,
            offersPerStore: offerService.getOffersPerStore(offers), newNormalizedNames,
            cacheHitRate: stats.cacheHitRate, pendingRate: stats.pendingRate, errors, success
        });
        return {
            success, timestamp, duration, pendingCount, totalOffers: offers.length,
            newNormalizedNames, errors,
            message: success
                ? 'Oppdatering fullført. ' + pendingCount + ' produkter trenger kontroll.'
                : 'Oppdatering fullført med feil i innhenting. Se oppdateringsstatus.'
        };
    } catch (error) {
        try {
            saveWeeklyUpdateMetrics({
                timestamp, duration: Date.now() - started, totalOffers: 0, totalNormalizedNames: 0,
                offersPerStore: {}, newNormalizedNames: 0, cacheHitRate: 0, pendingRate: 0,
                errors: { ...errors, global: (error as Error).message }, success: false
            });
        } catch (metricsError) {
            console.error('Kunne ikke lagre oppdateringsfeilen:', metricsError);
        }
        throw error;
    }
}
