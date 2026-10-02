export type Facet = 'product_type' | 'ingredient' | 'dish' | 'dietary' | 'usage';
export interface Category { id: string; name: string; parentId: string | null; facet?:Facet; definition?:string; assignable?:boolean; active?:boolean }
export interface Assignment { categoryId:string; facet:Facet; relation:''|'is_dish'|'for_dish' }
export interface Classification {
  stale?:boolean;
  conceptId?:string;
  assignments?:Assignment[];
  input?:Partial<Offer>[];
  manualLock?:boolean;
  normalizedName: string;
  categoryIds: string[];
  source: 'manual' | 'ai';
  needsReview: boolean;
  confidence: number | null;
  reviewReason: string | null;
}
export interface Offer {
  offerOccurrenceId?:string;
  conceptId?:string;
  assignments?:Assignment[];
  classificationLayer?:'legacy'|'concept'|'legacy-fallback';
  stale?:boolean;
  manualLock?:boolean;
  promptVersion?:string|null;
  taxonomyVersion?:string|null;
  model?:string|null;
  title: string;
  description?: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  currency: string;
  quantity?: string;
  unit?: string;
  pieces?: number;
  size?: number;
  validFrom?: string;
  validTo?: string;
  imageUrl?: string;
  offerId?: string;
  catalogId?: string;
  hotspotId?: string;
  store: string;
  storeLogo?: string;
  normalizedName: string;
  categoryIds: string[];
  effectiveCategoryIds: string[];
  categories: Category[];
  categorySource: string;
  categoryConfidence: number | null;
  needsReview: boolean;
  reviewReason: string | null;
  isActive?: boolean;
}
export interface CategorizeRequest { normalizedName: string; categoryIds: string[] }
export interface OffersResponse { count: number; offers: Offer[] }
