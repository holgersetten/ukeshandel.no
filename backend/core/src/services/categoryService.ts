import { normalizeTitle } from '../utils/normalizeTitle';
import { directCategories, getCategories, withAncestors } from '../config/categories';
import * as cache from '../db/categoryCacheRepo';
import { AI_CATEGORY_BATCH_SIZE, batchCategorizeWithAI, type AIProduct } from './aiCategorization';

class CategoryService {

  private running: Promise<void> | null = null;

  // Normaliserer, slår opp i SQLite, henter kategoriene, legger til overkategorier og returnerer et objekt med 
  // tilhørende egenskaper
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

  // Tar i mot en liste med offers og sørger for at kategoriseringsjobbene ikke kjører samtidig
  async categorizeOffers<T extends {title:string;description?:string}>(offers: T[]) {
    while (this.running) await this.running;
    this.running = this.run(offers);

    try { await this.running; } finally { this.running = null; }

    // bruker categorizeOffer(offer)
    return offers.map(o=>({...o,...this.categorizeOffer(o)}));
  }

  // Deler offers som ikke finnes i cachen inn i batches, sender disse til AI-modellen, behandler svarene og oppdaterer cachen
  private async run(offers: {title:string;description?:string}[]) {

    if ((process.env.SKIP_AI || '').trim().toLowerCase() === 'true' || !process.env.OPENAI_API_KEY) return;

    const missing = new Map<string,AIProduct>();

    // finner missing category offers
    for (const offer of offers) {
      const normalizedName = normalizeTitle(offer.title);
      const cached = normalizedName ? cache.get(normalizedName) : null;
      if (normalizedName && !cached && !missing.has(normalizedName)) missing.set(normalizedName,{normalizedName,title:offer.title,description:offer.description});
    }

    // samler offers uten kategori i et array
    if (!missing.size) return;
    const products = [...missing.values()];

    // deler de inn i batches (committer hver batch før ny begynner)
    for (let i = 0; i < products.length; i += AI_CATEGORY_BATCH_SIZE) {
      const batch = products.slice(i, i + AI_CATEGORY_BATCH_SIZE);
      const results = await batchCategorizeWithAI(batch);
     
      for (const { normalizedName: name } of batch) {
        const result = results.get(name);
        const ids = result?.categoryIds ?? [];
        let reviewReason: string | null = null;
        if (!result) reviewReason = 'AI returnerte ingen gyldig kategorisering';
        else if (!ids.length) reviewReason = 'KI fant ingen passende kategori';
        cache.save(name, ids, 'ai', null, reviewReason);
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

  // kategorisere på nytt offers som AI tidligere har kategorisert, men som fortsatt trenger manuell gjennomgang
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

  // antall offers som venter på manuell gjennomgang
  getPendingCount() { return cache.getAll().filter(c=>c.needsReview).length; }
}

export default new CategoryService();
