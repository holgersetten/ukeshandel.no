export type Facet = 'product_type' | 'ingredient' | 'dish' | 'dietary' | 'usage';
export interface TaxonomyCategory {
  id: string; name: string; parentId: string | null; facet: Facet;
  definition: string; assignable: boolean; active: boolean;
}
export interface ProductInput {
  title: string; description?: string; brand?: string; store?: string; source?: string;
  offerOccurrenceId?: string; offerId?: string | null; catalogId?: string | null; hotspotId?: string | null;
  quantity?: string; size?: number | null; pieces?: number; unit?: string;
  validFrom?: string | null; validTo?: string | null; imageUrl?: string | null;
  price?: number | null; currency?: string;
}
export interface Assignment { categoryId: string; facet: Facet; relation: '' | 'is_dish' | 'for_dish' }
export interface Suggestion {
  assignments: Assignment[]; confidence: number | null; insufficientEvidence: boolean;
  evidence: { categoryId: string; inputIndex: number; field: 'title' | 'description' | 'brand' | 'image'; quote: string }[];
}
export interface StoredClassification {
  conceptId: string; source: 'ai' | 'manual'; manualLock: boolean;
  promptVersion: string | null; taxonomyVersion: string; model: string | null;
  input: ProductInput[]; inputHash: string; confidence: number | null;
  needsReview: boolean; reviewReasons: string[]; assignments: Assignment[];
}
