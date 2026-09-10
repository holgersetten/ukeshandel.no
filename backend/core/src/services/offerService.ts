import path from 'path';
import { buildProductKey, buildCategoryKey } from '../utils/productKey';
import tjekApiService from '../../../persistence/src/services/tjekApiService';
import fileService from '../../../persistence/src/services/fileService';
import { getActiveStores, getStoreLogoUrl, Store } from '../../../rest/src/config/stores';
import config from '../../../rest/src/config/index';
import categoryService from './categoryService';
import { MainCategory, SubCategory } from '../config/categories';
import { registerProductKeyAliases } from '../db/productKeyAliases';
import { getDb } from '../db/db';

interface Offer {
    title: string;
    description?: string;
    price: number | null;
    originalPrice?: number | null;
    discount?: number | null;
    currency: string;
    quantity?: string;
    unit?: string;
    pieces?: number;
    size?: number | null;
    validFrom?: string | null;
    validTo?: string | null;
    imageUrl?: string | null;
    offerId?: string | null;
    catalogId?: string;
    hotspotId?: string;
    store?: string;
    storeLogo?: string | null;
    mainCategory?: MainCategory;
    subCategory?: SubCategory;
    ingredientKey?: string;
    categorySource?: 'manual' | 'rule' | 'ai' | 'unknown';
    categoryConfidence?: number;
    cacheStatus?: 'trusted' | 'pending';
    productKey?: string;
}

class OfferService {
    async updateAllStoreOffersWithTracking(): Promise<{ errors: Record<string, string> }> {
        const errors: Record<string, string> = {};

        try {
            const stores = getActiveStores();
            const results = await Promise.allSettled(
                stores.map(store => this.updateStoreOffers(store))
            );
            
            // Track errors per store
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const storeName = stores[index].name;
                    errors[storeName] = result.reason?.message || 'Unknown error';
                }
            });
            
            console.log('✅ Oppdatering av alle butikker fullført');
            return { errors };
        } catch (error) {
            console.error('❌ Feil under oppdatering av tilbud:', (error as Error).message);
            return { errors: { global: (error as Error).message } };
        }
    }

    getOffersPerStore(offers: any[]): Record<string, number> {
        const counts: Record<string, number> = {};
        offers.forEach(offer => {
            if (offer.store) {
                counts[offer.store] = (counts[offer.store] || 0) + 1;
            }
        });
        return counts;
    }

    async updateStoreOffers(store: Store): Promise<Offer[] | undefined> {
        try {
            if (!store || !store.name) {
                console.error(`❌ Ugyldig butikk-objekt:`, store);
                return;
            }
            
            const offers = await tjekApiService.getStoreOffers(store.dealerId);
            
            if (!offers || offers.length === 0) {
                console.log(`⚠️ Ingen tilbud funnet for ${store.name}`);
                return;
            }

            const enrichedOffers = offers.map((offer: Offer) => ({
                ...offer,
                store: store.name,
                storeLogo: getStoreLogoUrl(store.name),
                productKey: buildProductKey({ ...offer, store: store.name })
            }));

            registerProductKeyAliases(getDb(), enrichedOffers);

            const filename = `${store.name.toLowerCase().replace(/\s+/g, '_')}_offers.json`;
            const filePath = path.join(config.offersDir, filename);
            if (!fileService.saveJSON(filePath, enrichedOffers)) {
                throw new Error('Kunne ikke lagre tilbud for ' + store.name);
            }
            return enrichedOffers;
        } catch (error) {
            const storeName = store?.name || 'ukjent butikk';
            console.error(`❌ Feil ved henting av tilbud fra ${storeName}:`, (error as Error).message);
            throw error;
        }
    }

    async getAllOffers() {
        const stores = getActiveStores();
        const allOffers: Offer[] = [];

        for (const store of stores) {
            const filename = `${store.name.toLowerCase().replace(/\s+/g, '_')}_offers.json`;
            const filePath = path.join(config.offersDir, filename);
            
            try {
                const offers = fileService.loadJSON<Offer[]>(filePath);
                if (Array.isArray(offers)) {
                    allOffers.push(...offers);
                }
            } catch (error) {
                console.log(`⚠️ Kunne ikke laste tilbud for ${store.name}`);
            }
        }

        // Bruk kun synkron kategorisering fra cache - kjør IKKE AI her
        // Legg også til productKey for admin review
        const enrichedOffers = allOffers.map(offer => ({
            ...offer,
            ...categoryService.categorizeOffer(offer),
            productKey: buildProductKey(offer)
        }));

        return enrichedOffers;
    }

    async getOffersByStore(storeName: string) {
        const filename = `${storeName.toLowerCase().replace(/\s+/g, '_')}_offers.json`;
        const filePath = path.join(config.offersDir, filename);
        
        try {
            const offers = fileService.loadJSON<Offer[]>(filePath);
            // Bruk kun synkron kategorisering fra cache - kjør IKKE AI her
            return Array.isArray(offers) ? offers.map(offer => ({
                ...offer,
                ...categoryService.categorizeOffer(offer),
                productKey: buildProductKey(offer)
            })) : [];
        } catch (error) {
            console.log(`⚠️ Kunne ikke laste tilbud for ${storeName}`);
            return [];
        }
    }

    async getOffersNeedingReview() {
        const allOffers = await this.getAllOffers();
        
        // Legg til productKey på alle aktive tilbud
        const withProductKeys = allOffers.map(offer => ({
            ...offer,
            productKey: buildProductKey(offer),
            isActive: true
        }));
        
        // Filtrer aktive tilbud som trenger review
        const activeNeedingReview = withProductKeys.filter((offer: any) => {
            return offer.cacheStatus === 'pending' || offer.mainCategory === 'Ukategorisert';
        });
        
        // Hent ALLE ukategoriserte fra cache (inkluderer også gamle/utgåtte tilbud)
        const uncategorizedFromCache = categoryService.getAllUncategorizedFromCache();
        
        // Konverter cache entries til offer-format og merk som inactive
        const inactiveUncategorized = uncategorizedFromCache
            .filter(({ productKey }) => {
                // Ikke inkluder hvis allerede i aktive tilbud
                return !withProductKeys.some(o => o.productKey === productKey || buildCategoryKey(o) === productKey);
            })
            .map(({ productKey, entry }) => {
                // Parse productKey: title|store ELLER title|size|pieces|store
                const parts = productKey.split('|');
                const isOldFormat = parts.length === 2;
                
                return {
                    title: parts[0] || 'Ukjent',
                    size: isOldFormat ? 0 : (parseInt(parts[1]) || 0),
                    pieces: isOldFormat ? 1 : (parseInt(parts[2]) || 1),
                    store: isOldFormat ? parts[1] : (parts[3] || 'Ukjent'),
                    price: 0,
                    currency: 'kr',
                    quantity: '',
                    mainCategory: entry.mainCategory,
                    subCategory: entry.subCategory,
                    ingredientKey: entry.ingredientKey,
                    cacheStatus: entry.cacheStatus,
                    productKey,
                    isActive: false // Markerer som inaktivt/gammelt tilbud
                };
            });
        
        const combined = [...activeNeedingReview, ...inactiveUncategorized];
        console.log(`📊 Review: ${activeNeedingReview.length} aktive, ${inactiveUncategorized.length} inaktive (utløpte), totalt ${combined.length}`);
        
        return combined;
    }


}

export default new OfferService();
