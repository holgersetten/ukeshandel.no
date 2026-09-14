import axios from 'axios';
import config from '../../../rest/src/config';

interface ImageResponse { view?: string | null; zoom?: string | null; thumb?: string | null }

class ImageService {
  private readonly baseUrl = config.tjekApiBaseUrl;
  private readonly cache = new Map<string, { value: ImageResponse; at: number }>();
  private readonly ttl = 60 * 60 * 1000;
  private readonly requestTimeout = 30000;
  private readonly maxConcurrency = 5;
  private readonly maxRetries = 2;

  private extractFirstImageUrl(value: unknown): string | null {
    if (!value) return null;

    if (typeof value === 'string') {
      return value.startsWith('http') ? value : null;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const url = this.extractFirstImageUrl(item);
        if (url) return url;
      }
      return null;
    }

    if (typeof value !== 'object') return null;

    const object = value as Record<string, unknown>;
    const preferredKeys = ['view', 'zoom', 'thumb', 'url', 'src', 'image'] as const;

    for (const key of preferredKeys) {
      const nested = object[key];
      const url = this.extractFirstImageUrl(nested);
      if (url) return url;
    }

    for (const nested of Object.values(object)) {
      const url = this.extractFirstImageUrl(nested);
      if (url) return url;
    }

    return null;
  }

  private async fetchOfferImage(offerId: string): Promise<ImageResponse> {
    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const response = await axios.get(`${this.baseUrl}/offers/${encodeURIComponent(offerId)}`, {
          timeout: this.requestTimeout,
          headers: { 'User-Agent': 'Ukeshandel.no/1.0', Accept: 'application/json' }
        });

        const raw = response.data?.images;
        const view = this.extractFirstImageUrl(raw?.view ?? raw?.view?.url ?? raw?.view?.zoom ?? raw?.view?.zoom?.url ?? raw);
        const zoom = this.extractFirstImageUrl(raw?.zoom ?? raw?.zoom?.url ?? raw);
        const thumb = this.extractFirstImageUrl(raw?.thumb ?? raw?.thumb?.url ?? raw);
        const images: ImageResponse = {
          view: view || null,
          zoom: zoom || null,
          thumb: thumb || null
        };

        this.cache.set(offerId, { value: images, at: Date.now() });
        return images;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return {};

        const shouldRetry = axios.isAxiosError(error)
          && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.response?.status === 429 || (error.response?.status ?? 0) >= 500 || /timeout/i.test(error.message));

        if (!shouldRetry || attempt > this.maxRetries) {
          if (!axios.isAxiosError(error) || error.response?.status !== 404) {
            console.warn(`Bilde kunne ikke hentes for tilbud ${offerId}:`, (error as Error).message);
          }
          return {};
        }

        await new Promise(resolve => setTimeout(resolve, 250 * attempt));
      }
    }

    return {};
  }

  async getOfferImage(offerId: string): Promise<ImageResponse> {
    const cached = this.cache.get(offerId);
    if (cached && Date.now() - cached.at < this.ttl) return cached.value;
    return this.fetchOfferImage(offerId);
  }

  async enrichOffers<T extends { offerId?: string | null; imageUrl?: string | null }>(offers: T[]): Promise<T[]> {
    const missing = offers.filter(offer => !offer.imageUrl && offer.offerId);

    for (let i = 0; i < missing.length; i += this.maxConcurrency) {
      const batch = missing.slice(i, i + this.maxConcurrency);
      const results = await Promise.all(batch.map(offer => this.getOfferImage(offer.offerId!)));
      results.forEach((images, index) => {
        const url = images.view || images.zoom || images.thumb;
        if (url) batch[index].imageUrl = url;
      });
    }

    return offers;
  }
}
export default new ImageService();
