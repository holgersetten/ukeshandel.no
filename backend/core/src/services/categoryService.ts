import { normalizeTitle } from '../utils/normalizeTitle';
import { directCategories, getCategories, withAncestors } from '../config/categories';
import * as cache from '../db/categoryCacheRepo';
import { batchCategorizeWithAI, type AIProduct } from './aiCategorization';

class CategoryService {
  private running: Promise<void> | null = null;
  categorizeOffer(offer: {title:string}) {
    const normalizedName = normalizeTitle(offer.title);
    const entry = cache.get(normalizedName);
    const categoryIds = entry?.categoryIds || [];
    const effectiveCategoryIds = withAncestors(categoryIds);
    return { normalizedName, categoryIds, effectiveCategoryIds,
      categories: getCategories().filter(c => effectiveCategoryIds.includes(c.id)),
      categorySource: entry?.source || 'unknown', categoryConfidence: entry?.confidence ?? null,
      needsReview: entry?.needsReview ?? true, reviewReason: entry?.reviewReason ?? null };
  }
  async categorizeOffers<T extends {title:string;description?:string}>(offers: T[]) {
    // Recheck each caller's names after a concurrent job finishes.
    while (this.running) await this.running;
    this.running = this.run(offers);
    try { await this.running; } finally { this.running = null; }
    return offers.map(o=>({...o,...this.categorizeOffer(o)}));
  }
  private async run(offers: {title:string;description?:string}[]) {
    if ((process.env.SKIP_AI || '').trim().toLowerCase() === 'true' || !process.env.OPENAI_API_KEY) return;
    const missing = new Map<string,AIProduct>();
    for (const offer of offers) {
      const normalizedName = normalizeTitle(offer.title);
      const cached = normalizedName ? cache.get(normalizedName) : null;
      if (normalizedName && !cached && !missing.has(normalizedName)) missing.set(normalizedName,{normalizedName,title:offer.title,description:offer.description});
    }
    if (!missing.size) return;
    const products = [...missing.values()];
    for (let i = 0; i < products.length; i += 30) {
      const batch = products.slice(i, i + 30);
      const results = await batchCategorizeWithAI(batch);
      // Commit each completed batch so a later network failure cannot discard earlier results.
      for (const { normalizedName: name } of batch) {
        const result = results.get(name);
        cache.save(name,result?.categoryIds || [],'ai',result?.confidence ?? null,result ? null : 'AI returnerte ingen gyldig kategorisering');
      }
    }
  }
  setManualCategory(normalizedName: string, categoryIds: unknown) {
    const ids = directCategories(categoryIds);
    cache.save(normalizedName,ids,'manual',1);
  }
  retryCategory(normalizedName: string) {
    cache.remove(normalizedName);
  }
  async retryReviewCategories() {
    if ((process.env.SKIP_AI || '').trim().toLowerCase() === 'true' || !process.env.OPENAI_API_KEY) {
      throw new Error('AI-kategorisering er ikke konfigurert');
    }
    const names = cache.getAll()
      .filter(entry => entry.needsReview && entry.source === 'ai')
      .map(entry => entry.normalizedName);
    for (const name of names) cache.remove(name);
    if (names.length) await this.categorizeOffers(names.map(title => ({title})));
    return names.length;
  }
  getPendingCount() { return cache.getAll().filter(c=>c.needsReview).length; }
}
export default new CategoryService();
