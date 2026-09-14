import type { Category, Offer } from '../types/offer';
export function categoryPath(id:string,categories:Category[]):string {
  const category=categories.find(c=>c.id===id);
  return category ? (category.parentId ? categoryPath(category.parentId,categories)+' → ' : '')+category.name : id;
}
export function ancestors(id:string,categories:Category[]):string[] {
  const parent=categories.find(c=>c.id===id)?.parentId;
  return parent ? [parent,...ancestors(parent,categories)] : [];
}
export function offerIdentity(offer:Offer):string {
  // Rendering identity, never used for categorization or persistent product matching.
  return JSON.stringify([offer.store,offer.offerId,offer.hotspotId,offer.catalogId,offer.title,offer.quantity,offer.size,offer.unit,offer.pieces,offer.price,offer.validFrom,offer.validTo]);
}
