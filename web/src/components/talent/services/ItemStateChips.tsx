import {
  bookingModeLabel,
  publicationLabel,
  publicationWord,
} from "@/lib/talent/publication-state";
import type { TalentOffering } from "@/lib/talent/offerings-types";

export function ItemStateChips({
  item,
  locale,
  showBooking = true,
  hideFailed = false,
}: {
  item: TalentOffering;
  locale: string;
  showBooking?: boolean;
  hideFailed?: boolean;
}) {
  const word = publicationWord({ status: item.status, firstPublishedAt: item.firstPublishedAt });
  const soldOut = item.inventoryQty === 0;
  const onRequest = item.visibility === "on_request";
  const agencyOnly = item.visibility === "agency_only";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {showBooking && (
        <span className="text-[11px] font-medium text-admin-ink-muted">
          {bookingModeLabel(item, locale)}
        </span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          word === "live"
            ? "bg-[rgba(15,79,62,0.12)] text-[#0F4F3E]"
            : word === "hidden"
              ? "bg-[rgba(11,11,13,0.08)] text-admin-ink-muted"
              : "border border-admin-border-soft bg-white text-admin-ink"
        }`}
      >
        {publicationLabel(word, locale)}
      </span>
      {soldOut && (
        <span className="rounded-full bg-[rgba(11,11,13,0.08)] px-2 py-0.5 text-[10px] font-semibold text-admin-ink">
          {locale.startsWith("es") ? "Agotado" : "Sold out"}
        </span>
      )}
      {item.inventoryQty != null && item.inventoryQty > 0 && item.inventoryQty <= 5 && (
        <span className="text-[11px] text-admin-ink-muted">
          {item.inventoryQty} {locale.startsWith("es") ? "restantes" : "left"}
        </span>
      )}
      {onRequest && (
        <span className="text-[11px] text-admin-ink-muted">
          {locale.startsWith("es") ? "Bajo consulta" : "On request"}
        </span>
      )}
      {agencyOnly && (
        <span className="text-[11px] text-admin-ink-muted">
          {locale.startsWith("es") ? "Solo agencias" : "Agencies only"}
        </span>
      )}
      {hideFailed && (
        <span className="rounded-full bg-[rgba(176,32,32,0.1)] px-2 py-0.5 text-[10px] font-semibold text-[#8A1F1F]">
          {locale.startsWith("es") ? "No se ocultó" : "Hide failed"}
        </span>
      )}
    </span>
  );
}
