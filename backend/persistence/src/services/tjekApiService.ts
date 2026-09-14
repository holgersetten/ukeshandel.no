import axios from 'axios';
import config from '../../../rest/src/config/index';

interface Catalog {
    id: string;
    [key: string]: any;
}

interface QuantityData {
    pieces?: number | { from?: number; to?: number };
    size?: number | { from?: number; to?: number };
    unit?: string | { symbol?: string };
}

interface Offer {
    id?: string;
    heading?: string;
    description?: string;
    pricing?: {
        price?: number;
        pre_price?: number;
        discount?: number;
        currency?: string;
    };
    quantity?: QuantityData;
    run_from?: string;
    run_till?: string;
    images?: Array<{ view?: { zoom?: { url?: string } } }>;
}

interface Hotspot {
    id: string;
    catalog_id: string;
    offer?: Offer;
}

interface TransformedOffer {
    title: string;
    description: string;
    price: number | null;
    originalPrice: number | null;
    discount: number | null;
    currency: string;
    quantity: string;
    unit: string;
    pieces: number;
    size: number | null;
    validFrom: string | null;
    validTo: string | null;
    imageUrl: string | null;
    offerId: string | null;
    catalogId: string;
    hotspotId: string;
}

class TjekApiService {
    private baseURL: string;
    private headers: Record<string, string>;

    constructor() {
        this.baseURL = config.tjekApiBaseUrl;
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };
    }

    async getLatestCatalog(dealerId: string): Promise<Catalog | null> {
        try {
            const url = `${this.baseURL}/catalogs?dealer_id=${dealerId}&order_by=-publication_date&limit=1`;
            const response = await axios.get<Catalog[]>(url, { headers: this.headers });
            const catalog = response.data?.[0] || null;
            
            return catalog;
        } catch (error) {
            console.error(`❌ Feil ved henting av katalog for dealer ${dealerId}:`, (error as Error).message);
            return null;
        }
    }

    async getActiveCatalogs(dealerId: string): Promise<Catalog[]> {
        try {
            const now = new Date().toISOString();
            // Hent alle kataloger publisert siste 30 dager
            const url = `${this.baseURL}/catalogs?dealer_id=${dealerId}&order_by=-publication_date&limit=10`;
            const response = await axios.get<Catalog[]>(url, { headers: this.headers });
            const catalogs = response.data || [];
            
            // Filtrer til kataloger som er aktive nå (run_from <= now <= run_till)
            const activeCatalogs = catalogs.filter(catalog => {
                const runFrom = catalog.run_from ? new Date(catalog.run_from) : null;
                const runTill = catalog.run_till ? new Date(catalog.run_till) : null;
                const nowDate = new Date(now);
                
                const isActive = 
                    (!runFrom || runFrom <= nowDate) && 
                    (!runTill || runTill >= nowDate);
                
                return isActive;
            });
            
            // Gruppér kataloger etter periode (run_from + run_till) for å unngå duplikater
            // Velg kun den første (nyeste) katalogen fra hver periode
            const uniquePeriods = new Map<string, typeof activeCatalogs[0]>();
            
            activeCatalogs.forEach(catalog => {
                const periodKey = `${catalog.run_from}_${catalog.run_till}`;
                if (!uniquePeriods.has(periodKey)) {
                    uniquePeriods.set(periodKey, catalog);
                }
            });
            
            const uniqueCatalogs = Array.from(uniquePeriods.values());
            
            console.log(`📚 Fant ${activeCatalogs.length} aktive kataloger (${uniqueCatalogs.length} unike perioder) for dealer ${dealerId}`);
            return uniqueCatalogs;
        } catch (error) {
            console.error(`❌ Feil ved henting av aktive kataloger for dealer ${dealerId}:`, (error as Error).message);
            return [];
        }
    }

    async getCatalogHotspots(catalogId: string): Promise<Hotspot[]> {
        try {
            // Tjek API returnerer ALLE hotspots uten å respektere pagination
            // Vi henter derfor bare én gang uten offset/limit
            const url = `${this.baseURL}/catalogs/${catalogId}/hotspots`;
            const response = await axios.get<Hotspot[]>(url, { headers: this.headers });
            const hotspots = response.data || [];

            console.log(`📦 Hentet ${hotspots.length} hotspots for katalog ${catalogId}`);
            return hotspots;
        } catch (error) {
            console.error(`❌ Feil ved henting av hotspots for katalog ${catalogId}:`, (error as Error).message);
            return [];
        }
    }

    async getStoreOffers(dealerId: string): Promise<TransformedOffer[]> {
        try {
            // Hent kun den nyeste katalogen (den er som oftest gjeldende ukeavis)
            const catalog = await this.getLatestCatalog(dealerId);
            if (!catalog) {
                console.warn(`⚠️ Ingen katalog funnet for dealer ${dealerId}`);
                return [];
            }

            // Hent alle hotspots fra katalogen (uten pagination)
            const hotspots = await this.getCatalogHotspots(catalog.id);
            const offers = this.transformHotspotsToOffers(hotspots);
            
            console.log(`✅ ${offers.length} tilbud fra katalog ${catalog.id} for dealer ${dealerId}`);
            return offers;
        } catch (error) {
            console.error(`❌ Feil ved henting av tilbud for dealer ${dealerId}:`, (error as Error).message);
            return [];
        }
    }

    transformHotspotsToOffers(hotspots: Hotspot[]): TransformedOffer[] {
        return hotspots
            .filter(hotspot => hotspot && hotspot.offer)
            .map(hotspot => {
                const offer = hotspot.offer!;
                const quantity = offer?.quantity || {};
                
                let pieces = 1;
                let size: number | null = null;
                let unit = '';
                
                if (quantity.pieces) {
                    if (typeof quantity.pieces === 'object') {
                        pieces = quantity.pieces.from || quantity.pieces.to || 1;
                    } else {
                        pieces = quantity.pieces || 1;
                    }
                }
                
                if (quantity.size) {
                    if (typeof quantity.size === 'object') {
                        size = quantity.size.from || quantity.size.to || null;
                    } else {
                        size = quantity.size;
                    }
                }
                
                if (quantity.unit) {
                    if (typeof quantity.unit === 'object' && quantity.unit.symbol) {
                        unit = quantity.unit.symbol;
                    } else if (typeof quantity.unit === 'string') {
                        unit = quantity.unit;
                    }
                }
                
                let quantityText = '';
                if (pieces > 1 && size && unit) {
                    quantityText = `${pieces} × ${size}${unit}`;
                } else if (size && unit) {
                    quantityText = `${size}${unit}`;
                } else if (pieces > 1) {
                    quantityText = `${pieces} stk`;
                }
                
                return {
                    title: offer?.heading || 'Ukjent tilbud',
                    description: offer?.description || '',
                    price: offer?.pricing?.price || null,
                    originalPrice: offer?.pricing?.pre_price || null,
                    discount: offer?.pricing?.discount || null,
                    currency: offer?.pricing?.currency || 'NOK',
                    quantity: quantityText,
                    unit: unit,
                    pieces: pieces,
                    size: size,
                    validFrom: offer?.run_from || null,
                    validTo: offer?.run_till || null,
                    imageUrl: this.extractImageUrl(offer?.images) || null,
                    offerId: offer?.id || null,
                    catalogId: hotspot.catalog_id,
                    hotspotId: hotspot.id
                };
            });
    }

    private extractImageUrl(images: unknown): string | null {
        if (!images) return null;

        const visit = (value: unknown): string | null => {
            if (!value) return null;

            if (typeof value === 'string') {
                return value.startsWith('http') ? value : null;
            }

            if (Array.isArray(value)) {
                for (const item of value) {
                    const url = visit(item);
                    if (url) return url;
                }
                return null;
            }

            if (typeof value !== 'object') return null;

            const object = value as Record<string, unknown>;
            for (const key of ['view', 'zoom', 'thumb', 'url', 'src', 'image']) {
                const found = visit(object[key]);
                if (found) return found;
            }

            for (const nested of Object.values(object)) {
                const found = visit(nested);
                if (found) return found;
            }

            return null;
        };

        return visit(images);
    }
}

export default new TjekApiService();
