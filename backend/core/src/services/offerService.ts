import path from 'path';
import tjekApiService from '../../../persistence/src/services/tjekApiService';
import fileService from '../../../persistence/src/services/fileService';
import { getActiveStores, getStoreLogoUrl, Store } from '../../../rest/src/config/stores';
import config from '../../../rest/src/config/index';
import categoryService from './categoryService';
import imageService from '../../../persistence/src/services/imageService';
import { offerOccurrenceId } from '../utils/offerOccurrence';
import conceptService from './concepts/conceptService';
import { conceptMode } from './concepts/config';

interface Offer {
    offerOccurrenceId?: string;
    source?: string;
    brand?: string;
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
            for (const offer of enrichedOffers) {
                try {offer.offerOccurrenceId = offerOccurrenceId(offer);} catch { /* Keep legacy records without source period in the fallback. */ }
            }


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
                    allOffers.push(...offers.map(offer=>({...offer,store:offer.store || store.name})));
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
        let occurrenceId:string|undefined;
        try {occurrenceId=offerOccurrenceId(offer);}catch { /* Preserve legacy offers lacking period information. */ }
        const legacy=categoryService.categorizeOffer(offer);
        if(conceptMode()==='concept') {
          try {
            const result=conceptService.read(offer);
            if(result?.usable)return {...data,...result,classificationLayer:'concept' as const};
            return {...data,...legacy,offerOccurrenceId:occurrenceId,conceptId:result?.conceptId,
              assignments:result?.assignments || [],classificationLayer:'legacy-fallback' as const,
              needsReview:true,reviewReason:result?.reviewReason || 'new_concept_requires_classification',
              manualLock:result?.manualLock || false,stale:result?.stale ?? true};
          } catch {return {...data,...legacy,offerOccurrenceId:occurrenceId,classificationLayer:'legacy-fallback' as const,needsReview:true,reviewReason:'missing_occurrence_identity'};}
        }
        return {...data,...legacy,offerOccurrenceId:occurrenceId,classificationLayer:'legacy' as const};
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
