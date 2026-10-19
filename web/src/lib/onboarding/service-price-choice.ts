/**
 * TUL-633: the signup price choice per service, pure.
 *
 *  - A pre-filled suggestion (`priceSuggested`) is never published as a price until the person confirms it
 *    (one tap, or by editing the amount).
 *  - "Get a quote" (`quoteChosen`) is a deliberate choice: the service is published as "Request a quote"
 *    (existing model: price_display "quote" + request booking), not held back as an unpriced draft.
 *
 * Builds on TUL-567 (an unpriced service is never published): only these two explicit states change a row.
 */
import type { EssentialService, OfferingRowDraft } from "./essentials";

/** Resolver contract from `@/lib/pricing/suggested-price`, injected so tests use fakes. */
export type SuggestedPriceLike = { amountMinor: number; currency: string; durationMinutes: number | null };
export type SuggestionDeps = {
  getSuggestedPrice: (input: { countryCode: string | null; serviceKey: string }) => Promise<SuggestedPriceLike | null>;
  serviceKeyFor: (packKey: string, enName: string) => string;
};

export function applyPriceChoice(row: OfferingRowDraft, s: EssentialService): OfferingRowDraft {
  if (s.priceSuggested) return { ...row, amount_cents: null, booking_mode: "request", status: "draft" };
  if (s.quoteChosen && (s.quote || !s.priceCents)) {
    return { ...row, price_display: "quote", amount_cents: null, booking_mode: "request", status: "published" };
  }
  return row;
}

export const isQuoteChosen = (s: EssentialService): boolean => s.quoteChosen === true;
export const hasUnconfirmedPrice = (services: EssentialService[]): boolean => services.some((s) => s.priceSuggested === true);

export const confirmPrice = (s: EssentialService): EssentialService => ({ ...s, priceSuggested: false });
export const confirmAllPrices = (list: EssentialService[]): EssentialService[] => list.map(confirmPrice);

/** Editing the amount is a confirmation. */
export function setPrice(s: EssentialService, priceCents: number | null): EssentialService {
  return { ...s, priceCents, quote: false, quoteChosen: false, priceSuggested: false };
}
export function chooseQuote(s: EssentialService): EssentialService {
  return { ...s, quote: true, quoteChosen: true, priceCents: null, priceSuggested: false };
}
/** Back to a fixed price: the field is empty until a number is typed (no price yet = stays a draft). */
export function chooseFixed(s: EssentialService): EssentialService {
  return { ...s, quote: false, quoteChosen: false, priceSuggested: false };
}

/**
 * Pre-fill each pack service with the suggested price for the country, flagged as unconfirmed. A service
 * that already carries a pack price (Mexico) is flagged too. No suggestion and no price: left as it is.
 */
export async function applySuggestedPrices(
  services: EssentialService[],
  countryCode: string | null,
  deps: SuggestionDeps,
): Promise<EssentialService[]> {
  return Promise.all(
    services.map(async (s) => {
      if (s.quoteChosen || !s.packKey) return s;
      const en = s.nameI18n?.en;
      let hit: SuggestedPriceLike | null = null;
      if (en) {
        try { hit = await deps.getSuggestedPrice({ countryCode, serviceKey: deps.serviceKeyFor(s.packKey, en) }); } catch { hit = null; }
      }
      if (hit && hit.amountMinor > 0) {
        return { ...s, priceCents: hit.amountMinor, currency: hit.currency, durationMin: s.durationMin ?? hit.durationMinutes, quote: false, priceSuggested: true };
      }
      return s.priceCents && s.priceCents > 0 && !s.quote ? { ...s, priceSuggested: true } : s;
    }),
  );
}
