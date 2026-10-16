/**
 * post-price-source.ts — how a `service` block gets its price label.
 *
 * The post never stores a price. At render time the caller resolves each
 * offering id through a `PostPriceSource`. Returning null means the service is
 * deleted, unpublished or unpriced, and the block renders nothing.
 *
 * Default implementation reuses what the service page uses today:
 * `pickHeadlinePrice` (headline-price.ts) + `formatPriceFromLabel`
 * (format-price-from.ts). The data fetch is injected so this stays pure and
 * server-only code owns the tenant-scoped query.
 *
 * TODO(TUL-791): swap to the shared displayPrice() once it lands.
 */
import { formatPriceFromLabel, formatPriceUnitSuffix } from "@/lib/directory/format-price-from";
import { pickHeadlinePrice, type CatalogPriceRow } from "@/lib/directory/headline-price";

export type PostServicePrice = { label: string } | null;
export type PostPriceSource = (offeringId: string) => Promise<PostServicePrice>;

/** Loads the published price rows for an offering; null when it is gone or unpublished. */
export type OfferingPriceRowsLoader = (
  offeringId: string,
) => Promise<readonly CatalogPriceRow[] | null>;

export function createDefaultPostPriceSource(
  loadRows: OfferingPriceRowsLoader,
  locale: string,
): PostPriceSource {
  return async (offeringId) => {
    const rows = await loadRows(offeringId);
    if (!rows) return null;
    const head = pickHeadlinePrice(rows);
    if (!head) return null;
    const base = formatPriceFromLabel(head.amountCents, head.currency, locale);
    const unit = formatPriceUnitSuffix(head.priceType, locale);
    return { label: unit ? `${base} ${unit}` : base };
  };
}
