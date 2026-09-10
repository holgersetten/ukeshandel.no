import { normalizeTitle } from "./normalizeTitle";

export type OfferLike = {
    title: string;
    store?: string | null;
    size?: number | null;
    unit?: string | null;
    pieces?: number | null;
    quantity?: string | null; // fallback hvis size/unit mangler
};

const normalizeUnit = (unit?: string | null) =>
    (unit ?? "").toLowerCase().trim();

const normalizeStore = (store?: string | null) =>
    normalizeTitle(store ?? "").trim();

const sizePart = (o: OfferLike): string => {
    if (o.size != null && o.unit) return `${o.size}${normalizeUnit(o.unit)}`;
  if (o.quantity) return normalizeTitle(o.quantity).replace(/\s+/g, "");
  return "na";
};

/** Stabil nøkkel for caching/gruppering. Ikke inkluder pris/dato/rabatt */
export const buildProductKey = (o: OfferLike): string => {
  const title = normalizeTitle(o.title);
  const size = sizePart(o);
  const pieces = o.pieces != null ? `x${o.pieces}` : "x1";
  const store = o.store ? normalizeStore(o.store) : "nostore";

  return `${title}|${size}|${pieces}|${store}`;
};

/** Mykere nøkkel hvis man vil at samme vare i ulike størrelser skal arve samme kategori */
export const buildCategoryKey = (o: OfferLike): string => {
  const title = normalizeTitle(o.title);
  const store = o.store ? normalizeStore(o.store) : "nostore";
  return `${title}|${store}`;
};

/** Godtar også gamle produktnøkler fra tidligere åpne adminvinduer. */
export function categoryKeyFromProductKey(key: string): string {
  const parts = key.split('|');
  if (parts.length !== 2 && parts.length !== 4) throw new Error('Ugyldig produktnøkkel');
  return buildCategoryKey({ title: parts[0], store: parts[parts.length - 1] });
}

/** Kun for å knytte eksisterende lagrede data til det felles formatet. */
export function buildLegacyProductKey(o: OfferLike): string {
  return `${o.title}|${o.size || 0}|${o.pieces || 1}|${o.store || 'unknown'}`;
}
