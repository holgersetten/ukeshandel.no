import { createHash } from 'crypto';
import { normalizeTitle } from './normalizeTitle';
import type { ProductInput } from '../services/concepts/types';

export function stableJSON(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJSON).join(',') + ']';
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).filter(k => object[k] !== undefined).sort()
      .map(k => JSON.stringify(k) + ':' + stableJSON(object[k])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}
export const hashInput = (value: unknown) => createHash('sha256').update(stableJSON(value)).digest('hex');

/** Occurrence identity, never a cross-catalog product identity. Price is intentionally excluded. */
export function offerOccurrenceId(offer: ProductInput): string {
  const store = normalizeTitle(offer.store || '');
  if (!store) throw new Error('Tilbudsforekomst mangler butikk');
  const period = offer.catalogId ? ['catalog', offer.catalogId]
    : (offer.validFrom || offer.validTo) ? ['period', offer.validFrom || '', offer.validTo || ''] : null;
  if (!period) throw new Error('Tilbudsforekomst mangler katalog og gyldighetsperiode');
  const key = offer.offerId ? ['offer', offer.offerId] : offer.hotspotId ? ['hotspot', offer.hotspotId]
    : ['content', normalizeTitle(offer.title), offer.description || '', offer.quantity || '',
      offer.size ?? null, offer.unit || '', offer.pieces ?? null];
  if (!offer.offerId && !offer.hotspotId && !normalizeTitle(offer.title)) throw new Error('Tom tilbudsidentitet');
  return 'occ_' + hashInput(['occurrence-v1', offer.source || 'tjek', store, period, key]);
}

/** Keep original source fields, not API-enriched category fields. */
export function originalInput(offer: ProductInput): ProductInput {
  const keys: (keyof ProductInput)[] = ['title','description','brand','store','source','offerId','catalogId',
    'hotspotId','quantity','size','pieces','unit','validFrom','validTo','imageUrl','price','currency'];
  const result = Object.fromEntries(keys.filter(k => offer[k] !== undefined).map(k => [k, offer[k]])) as unknown as ProductInput;
  result.offerOccurrenceId = offerOccurrenceId(result);
  return result;
}
export function classificationInputHash(input: ProductInput[]): string {
  // Promotions and new occurrences do not change the meaning of an approved concept.
  return hashInput(input.map(o => ({title:o.title,description:o.description || '',brand:o.brand || '',
    quantity:o.quantity || '',size:o.size ?? null,unit:o.unit || '',pieces:o.pieces ?? null,imageUrl:o.imageUrl || ''}))
    .sort((a,b) => stableJSON(a).localeCompare(stableJSON(b))));
}
