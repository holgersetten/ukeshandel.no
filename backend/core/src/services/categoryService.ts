import { normalizeTitle } from '../utils/normalizeTitle';
import { directCategories, getLegacyCategories as getCategories, withAncestors } from '../config/categories';
import * as cache from '../db/categoryCacheRepo';
import { batchCategorizeWithAI, type AIProduct } from './aiCategorization';
import { conceptMode } from './concepts/config';
import conceptService from './concepts/conceptService';

class CategoryService {
  private running: Promise<void> | null = null;
  categorizeOffer(offer: {title:string}) {
    const normalizedName = normalizeTitle(offer.title);
    const entry = cache.get(normalizedName);
    const categoryIds = entry?.categoryIds || [];
    const effectiveCategoryIds = withAncestors(categoryIds,getCategories());
    return { normalizedName, categoryIds, effectiveCategoryIds,
      categories: getCategories().filter(c => effectiveCategoryIds.includes(c.id)),
      categorySource: entry?.source || 'unknown', categoryConfidence: entry?.confidence ?? null,
      needsReview: entry?.needsReview ?? true, reviewReason: entry?.reviewReason ?? null };
  }
  async categorizeOffers<T extends {title:string;description?:string}>(offers: T[]) {
    if (conceptMode()==='concept') {
      await conceptService.categorize(offers);
      return offers.map(o=>{try{const result=conceptService.read(o);if(result?.usable)return {...o,...result};}catch{/* Incomplete legacy source identities retain the old result. */}return {...o,...this.categorizeOffer(o),needsReview:true,reviewReason:'concept_classification_unavailable'};});
    }
    // Recheck each caller's names after a concurrent job finishes.
    while (this.running) await this.running;
    this.running = this.run(offers);
    try { await this.running; } finally { this.running = null; }
    if (conceptMode()==='shadow') await conceptService.categorize(offers);
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
    if(cache.get(normalizedName)?.source==='manual')throw new Error('Manuell klassifisering er låst');
    cache.remove(normalizedName);
  }
  async retryReviewCategories() {
    if (conceptMode()==='concept') return conceptService.retryAll();
    if ((process.env.SKIP_AI || '').trim().toLowerCase() === 'true' || !process.env.OPENAI_API_KEY) {
      throw new Error('AI-kategorisering er ikke konfigurert');
    }
    const names = cache.getAll()
      .filter(entry => entry.needsReview && entry.source === 'ai')
      .map(entry => entry.normalizedName);
    // Read original inputs before removing anything. Historical names without inputs stay intact.
    const currentOffers = await (await import('./offerService')).default.getAllOffers();
    const inputs=currentOffers.filter(o=>names.includes(o.normalizedName));
    const retryNames=new Set(inputs.map(o=>o.normalizedName));
    for(const name of retryNames)cache.remove(name);
    if (inputs.length) await this.categorizeOffers(inputs);
    return retryNames.size;
  }
  getPendingCount() { return conceptMode()==='concept' ? conceptService.getPendingCount() : cache.getAll().filter(c=>c.needsReview).length; }
}
export default new CategoryService();
