export interface Category { id: string; name: string; parentId: string | null }
export interface Classification {
  normalizedName: string;
  categoryIds: string[];
  source: 'manual' | 'ai';
  needsReview: boolean;
  confidence: number | null;
  reviewReason: string | null;
}
export interface Offer {
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
