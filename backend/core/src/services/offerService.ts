import path from 'path';
import tjekApiService from '../../../persistence/src/services/tjekApiService';
import fileService from '../../../persistence/src/services/fileService';
import { getActiveStores, getStoreLogoUrl, Store } from '../../../rest/src/config/stores';
import config from '../../../rest/src/config/index';
import categoryService from './categoryService';
import imageService from '../../../persistence/src/services/imageService';

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
                storeLogo: getStoreLogoUrl(store.name)
            }));

            await imageService.enrichOffers(enrichedOffers);


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

        return allOffers.map(offer => this.enrich(offer));
    }

    private enrich(offer: Offer) {
        // Strip only the retired categorization fields from legacy files. Preserve source data and title.
        const { productKey, categoryKey, mainCategory, subCategory, ingredientKey, cacheStatus, ...data } = offer as Offer & Record<string,unknown>;
        return {...data, ...categoryService.categorizeOffer(offer)};
    }

    async getOffersByStore(storeName: string) {
        if (!getActiveStores().some(store => store.name === storeName)) throw new Error('Ukjent butikk');
        return (await this.getAllOffers()).filter(offer => offer.store === storeName);
    }

    async getOffersNeedingReview() {
        return (await this.getAllOffers()).filter(offer => offer.needsReview);
    }
}
export default new OfferService();
