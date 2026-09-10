import { MainCategory, SubCategory, DEFAULT_MAIN_CATEGORY, DEFAULT_SUB_CATEGORY, CATEGORY_HIERARCHY } from '../config/categories';
import { buildProductKey, buildCategoryKey, categoryKeyFromProductKey } from '../utils/productKey';
import { batchCategorizeWithAI } from './aiCategorization';
import * as categoryCacheRepo from '../db/categoryCacheRepo';

type CategorySource = 'manual' | 'rule' | 'ai' | 'unknown';
type CacheStatus = 'trusted' | 'pending';

interface CategoryCacheEntry {
    mainCategory: MainCategory;
    subCategory: SubCategory;
    ingredientKey: string;
    source: CategorySource;
    confidence: {
        main: number;
        sub: number;
        ingredientKey: number;
    };
    cacheStatus?: CacheStatus; // Optional - beregnes dynamisk, lagres ikke
    timestamp?: string;
}

interface OfferLike {
    title: string;
    store?: string | null;
    size?: number | null;
    unit?: string | null;
    pieces?: number | null;
    quantity?: string | null;
}

class CategoryService {
    private ongoingCategorization: Promise<any> | null = null;



    private calculateCacheStatus(entry: CategoryCacheEntry): CacheStatus {
        if (entry.mainCategory === 'Ukategorisert') return 'pending';
        if (entry.confidence.main >= 0.90 && 
            entry.confidence.sub >= 0.88 && 
            entry.confidence.ingredientKey >= 0.90) {
            return 'trusted';
        }
        return 'pending';
    }

    getCategoryForProduct(productKey: string): CategoryCacheEntry | null {
        const data = categoryCacheRepo.get(productKey);
        if (!data) return null;
        
        // Konverter fra repo format til CategoryCacheEntry
        const entry: CategoryCacheEntry = {
            mainCategory: data.mainCategory as MainCategory,
            subCategory: data.subCategory as SubCategory,
            ingredientKey: data.ingredientKey,
            source: data.source as CategorySource,
            confidence: data.confidence,
            timestamp: data.timestamp
        };
        
        // Rekalkluler cacheStatus basert på gjeldende regler
        const recalculatedStatus: CacheStatus = this.calculateCacheStatus(entry);
        
        return {
            ...entry,
            cacheStatus: recalculatedStatus
        };
    }

    // Hent alle ukategoriserte produkter fra cache (selv om de ikke finnes i dagens tilbud)
    getAllUncategorizedFromCache(): Array<{ productKey: string; entry: CategoryCacheEntry }> {
        const allData = categoryCacheRepo.getAll();
        return Object.entries(allData)
            .filter(([_, data]) => data.mainCategory === 'Ukategorisert')
            .map(([productKey, data]) => {
                const entry: CategoryCacheEntry = {
                    mainCategory: data.mainCategory as MainCategory,
                    subCategory: data.subCategory as SubCategory,
                    ingredientKey: data.ingredientKey,
                    source: data.source as CategorySource,
                    confidence: data.confidence,
                    timestamp: data.timestamp
                };
                return {
                    productKey,
                    entry: {
                        ...entry,
                        cacheStatus: this.calculateCacheStatus(entry)
                    }
                };
            });
    }

    setCategoryForProduct(
        productKey: string,
        mainCategory: MainCategory,
        subCategory: SubCategory,
        ingredientKey: string,
        source: CategorySource,
        confidence: { main: number; sub: number; ingredientKey: number }
    ): void {
        // Valider at subCategory tilhører mainCategory
        const validSubs = CATEGORY_HIERARCHY[mainCategory] as readonly SubCategory[];
        if (!validSubs?.includes(subCategory)) {
            console.warn(`⚠️ Ugyldig subCategory "${subCategory}" for "${mainCategory}", flytter til "Ukategorisert"`);
            mainCategory = 'Ukategorisert' as MainCategory;
            subCategory = 'Ukategorisert' as SubCategory;
            confidence.main = 0.3; // Lav confidence for ukategorisert
            confidence.sub = 0.3;
        }

        // cacheStatus beregnes dynamisk i getCategoryForProduct()
        // og lagres IKKE for å unngå inkonsistens ved threshold-endringer
        const data: categoryCacheRepo.CategoryCacheData = {
            mainCategory,
            subCategory,
            ingredientKey,
            source,
            confidence,
            timestamp: new Date().toISOString()
        };
        categoryCacheRepo.upsert(productKey, data);
    }
    
    private getCachedCategory(offer: OfferLike): CategoryCacheEntry | null {
        const shared = this.getCategoryForProduct(buildCategoryKey(offer));
        // En manuell rettelse skal også overstyre eldre cache for en bestemt størrelse.
        if (shared?.source === 'manual') return shared;
        return this.getCategoryForProduct(buildProductKey(offer)) || shared;
    }

    categorizeOffer(offer: OfferLike): { 
        mainCategory: MainCategory; 
        subCategory: SubCategory; 
        ingredientKey: string;
        cacheStatus?: CacheStatus;
    } {
        const cached = this.getCachedCategory(offer);
        if (cached) {
            return {
                mainCategory: cached.mainCategory,
                subCategory: cached.subCategory,
                ingredientKey: cached.ingredientKey,
                cacheStatus: cached.cacheStatus
            };
        }

        // AI-kategorisering håndteres i batch av categorizeOffers()
        // For enkeltoppslag returnerer vi defaults
        return {
            mainCategory: DEFAULT_MAIN_CATEGORY,
            subCategory: DEFAULT_SUB_CATEGORY,
            ingredientKey: 'produkt',
            cacheStatus: undefined
        };
    }

    async categorizeOffers<T extends OfferLike>(offers: T[]): Promise<(T & { 
        productKey: string; 
        mainCategory: MainCategory; 
        subCategory: SubCategory; 
        ingredientKey: string;
        categorySource: CategorySource;
        categoryConfidence: number;
        cacheStatus?: CacheStatus;
    })[]> {
        console.log(`📋 Kategoriserer ${offers.length} tilbud...`);
        
        // Hvis kategorisering pågår, vent og returner synkron kategorisering
        if (this.ongoingCategorization) {
            console.log(`⏸️ Venter på pågående AI-kategorisering...`);
            await this.ongoingCategorization;
            console.log(`✅ Bruker cached resultater`);
            
            // Returner synkron kategorisering (bruker cache fra den pågående kategoriseringen)
            return offers.map(offer => {
                const productKey = buildProductKey(offer);
                const categorization = this.categorizeOffer(offer);
                const cacheEntry = this.getCachedCategory(offer);
                
                const avgConfidence = cacheEntry 
                    ? (cacheEntry.confidence.main + cacheEntry.confidence.sub + cacheEntry.confidence.ingredientKey) / 3
                    : 0;
                
                return {
                    ...offer,
                    productKey,
                    ...categorization,
                    categorySource: cacheEntry?.source || 'unknown' as CategorySource,
                    categoryConfidence: avgConfidence,
                    cacheStatus: cacheEntry?.cacheStatus
                };
            });
        }

        // Start ny kategorisering
        this.ongoingCategorization = this.doCategorization(offers);
        
        try {
            const result = await this.ongoingCategorization;
            return result;
        } finally {
            this.ongoingCategorization = null;
        }
    }

    private async doCategorization<T extends OfferLike>(offers: T[]): Promise<(T & { 
        productKey: string; 
        mainCategory: MainCategory; 
        subCategory: SubCategory; 
        ingredientKey: string;
        categorySource: CategorySource;
        categoryConfidence: number;
        cacheStatus?: CacheStatus;
    })[]> {
        // Steg 1: Kategoriser synkront (cache)
        const results = offers.map(offer => {
            const productKey = buildProductKey(offer);
            const categorization = this.categorizeOffer(offer);
            const cacheEntry = this.getCachedCategory(offer);
            
            // Beregn gjennomsnittlig confidence (0 hvis ikke cached)
            const avgConfidence = cacheEntry 
                ? (cacheEntry.confidence.main + cacheEntry.confidence.sub + cacheEntry.confidence.ingredientKey) / 3
                : 0;
            
            return {
                ...offer,
                productKey,
                ...categorization,
                categorySource: cacheEntry?.source || 'unknown' as CategorySource,
                categoryConfidence: avgConfidence,
                cacheStatus: cacheEntry?.cacheStatus
            };
        });

        // Steg 2: Samle alle "Ukjent" produkter for AI batch
        const uncategorized = results
            .filter(r => r.mainCategory === DEFAULT_MAIN_CATEGORY && r.ingredientKey === 'produkt')
            .map(r => ({
                productKey: r.productKey,
                title: r.title,
                store: r.store || undefined
            }));

        const cachedCount = results.length - uncategorized.length;
        console.log(`✅ ${cachedCount} produkter fra cache, ${uncategorized.length} trenger kategorisering`);

        // Kategoriser ALLE ukategoriserte produkter (ingen limit)
        const uncategorizedToProcess = uncategorized;
        
        if (uncategorizedToProcess.length > 0) {
            console.log(`🚀 Kategoriserer ${uncategorizedToProcess.length} produkter med AI...`);
        }

        // Sjekk om AI er tilgjengelig (dynamisk ved runtime)
        // Trim SKIP_AI verdien for å håndtere mellomrom fra batch-filer
        const skipAI = (process.env.SKIP_AI || '').trim().toLowerCase() === 'true';
        const aiEnabled = !skipAI && !!process.env.OPENAI_API_KEY;

        if (uncategorizedToProcess.length > 0 && !aiEnabled) {
            console.log(`⚠️ ${uncategorizedToProcess.length} produkter mangler kategorisering (AI deaktivert)`);
            return results;
        }

        if (uncategorizedToProcess.length > 0 && aiEnabled) {
            console.log(`🤖 Sender ${uncategorizedToProcess.length} produkter til AI...`);
            
            // Batch AI-kategorisering
            const aiResults = await batchCategorizeWithAI(uncategorizedToProcess);
            
            // Oppdater resultater og cache
            let trusted = 0, pending = 0;
            const cachedKeys = new Set<string>(); // Spor unike categoryKeys
            
            for (const result of results) {
                if (result.mainCategory === DEFAULT_MAIN_CATEGORY && result.ingredientKey === 'produkt') {
                    const aiResult = aiResults.get(result.productKey);
                    if (aiResult) {
                        // Beregn gjennomsnittlig confidence
                        const avgConfidence = (aiResult.confidence.main + aiResult.confidence.sub + aiResult.confidence.ingredientKey) / 3;
                        
                        // Oppdater offer med AI-resultat
                        result.mainCategory = aiResult.mainCategory;
                        result.subCategory = aiResult.subCategory;
                        result.ingredientKey = aiResult.ingredientKey;
                        result.categorySource = 'ai';
                        result.categoryConfidence = avgConfidence;
                        
                        // Cache med validering og cacheStatus
                        const categoryKey = buildCategoryKey(result);
                        
                        // Kun cache hvis vi ikke allerede har cached denne categoryKey i denne runden
                        if (!cachedKeys.has(categoryKey)) {
                            this.setCategoryForProduct(
                                categoryKey,
                                aiResult.mainCategory,
                                aiResult.subCategory,
                                aiResult.ingredientKey,
                                'ai',
                                aiResult.confidence
                            );
                            cachedKeys.add(categoryKey);
                        }
                        
                        // Tell trusted vs pending
                        const cacheEntry = this.getCategoryForProduct(categoryKey);
                        if (cacheEntry?.cacheStatus === 'trusted') {
                            trusted++;
                        } else {
                            pending++;
                        }
                    }
                }
            }
            
            console.log(`✅ AI-kategorisering: ${trusted} trusted, ${pending} pending (${cachedKeys.size} unike oppføringer lagret i cache)`);
        }

        return results;
    }

    setManualCategory(
        productKey: string,
        mainCategory: MainCategory,
        subCategory: SubCategory,
        ingredientKey: string
    ): boolean {
        // Konverter productKey til categoryKey for konsistent lagring
        // productKey: "title|size|pieces|store" → categoryKey: "title|store"
        const categoryKey = categoryKeyFromProductKey(productKey);
        
        console.log(`📝 Manuell kategorisering: ${productKey} → ${categoryKey}`);
        
        // Manuell kategorisering får alltid max confidence og trusted status
        this.setCategoryForProduct(
            categoryKey,
            mainCategory,
            subCategory,
            ingredientKey,
            'manual',
            { main: 1.0, sub: 1.0, ingredientKey: 1.0 }
        );
        
        return true;
    }
    
    // Teller antall pending produkter i cache
    getPendingCount(): number {
        let count = 0;
        const allData = categoryCacheRepo.getAll();
        for (const key in allData) {
            const data = allData[key];
            const isPending = 
                data.mainCategory === 'Ukategorisert' ||
                data.confidence.main < 0.90 ||
                data.confidence.sub < 0.88 ||
                data.confidence.ingredientKey < 0.90;
            if (isPending) count++;
        }
        return count;
    }

    // Statistikk for health monitoring
    getCacheStatistics() {
        const allData = categoryCacheRepo.getAll();
        const entries = Object.values(allData);
        const totalCached = entries.length;
        
        const trustedCount = entries.filter(data => 
            data.mainCategory !== 'Ukategorisert' &&
            data.confidence.main >= 0.90 &&
            data.confidence.sub >= 0.88 &&
            data.confidence.ingredientKey >= 0.90
        ).length;
        
        const pendingCount = totalCached - trustedCount;
        
        return {
            totalCached,
            trustedCount,
            pendingCount,
            cacheHitRate: totalCached > 0 ? (trustedCount / totalCached) * 100 : 0,
            pendingRate: totalCached > 0 ? (pendingCount / totalCached) * 100 : 0
        };
    }

    // Sletter alle pending entries fra cache (for re-kategorisering)
    removePendingFromCache(): number {
        let removed = 0;
        const allData = categoryCacheRepo.getAll();
        
        for (const key in allData) {
            const data = allData[key];
            const isPending = 
                data.mainCategory === 'Ukategorisert' ||
                data.confidence.main < 0.90 ||
                data.confidence.sub < 0.88 ||
                data.confidence.ingredientKey < 0.90;
            
            if (isPending) {
                categoryCacheRepo.remove(key);
                removed++;
            }
        }
        
        if (removed > 0) {
            console.log(`🧹 Slettet ${removed} pending produkter fra cache`);
        }
        
        return removed;
    }

    // Oppdater alle cached produkter med gammel hovedkategori til ny hovedkategori
    updateCachedMainCategory(oldMainCategory: string, newMainCategory: string): number {
        let updated = 0;
        const allData = categoryCacheRepo.getAll();
        
        for (const key in allData) {
            const data = allData[key];
            if (data.mainCategory === oldMainCategory) {
                data.mainCategory = newMainCategory;
                categoryCacheRepo.upsert(key, data);
                updated++;
            }
        }
        
        if (updated > 0) {
            console.log(`✅ Oppdatert ${updated} produkter: ${oldMainCategory} → ${newMainCategory}`);
        }
        
        return updated;
    }

    // Oppdater alle cached produkter med gammel subkategori til ny subkategori
    updateCachedSubCategory(mainCategory: string, oldSubCategory: string, newSubCategory: string): number {
        let updated = 0;
        const allData = categoryCacheRepo.getAll();
        
        for (const key in allData) {
            const data = allData[key];
            if (data.mainCategory === mainCategory && data.subCategory === oldSubCategory) {
                data.subCategory = newSubCategory;
                categoryCacheRepo.upsert(key, data);
                updated++;
            }
        }
        
        if (updated > 0) {
            console.log(`✅ Oppdatert ${updated} produkter: ${mainCategory} > ${oldSubCategory} → ${newSubCategory}`);
        }
        
        return updated;
    }

    // Flytt alle produkter med en kategori til Ukategorisert (for når kategori slettes)
    moveCategoryToUncategorized(mainCategory: string, subCategory: string | null): number {
        let moved = 0;
        const allData = categoryCacheRepo.getAll();
        
        for (const key in allData) {
            const data = allData[key];
            
            // Hvis subCategory er null, flytt alle med denne hovedkategorien
            if (subCategory === null && data.mainCategory === mainCategory) {
                data.mainCategory = 'Ukategorisert';
                data.subCategory = 'Ukategorisert';
                data.confidence.main = 0.3;
                data.confidence.sub = 0.3;
                categoryCacheRepo.upsert(key, data);
                moved++;
            }
            // Hvis subCategory er spesifisert, flytt bare de med denne kombinasjonen
            else if (subCategory !== null && data.mainCategory === mainCategory && data.subCategory === subCategory) {
                data.mainCategory = 'Ukategorisert';
                data.subCategory = 'Ukategorisert';
                data.confidence.main = 0.3;
                data.confidence.sub = 0.3;
                categoryCacheRepo.upsert(key, data);
                moved++;
            }
        }
        
        if (moved > 0) {
            console.log(`✅ Flyttet ${moved} produkter til Ukategorisert`);
        }
        
        return moved;
    }
}

export default new CategoryService();