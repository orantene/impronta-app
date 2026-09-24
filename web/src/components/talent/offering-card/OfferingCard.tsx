import { offeringPriceLabel, resolveOfferingCta, type TalentOffering } from "@/lib/talent/offerings-types";
import { usdEquivalentLabel, type UsdRates } from "@/lib/pricing/usd-equivalent";
import { ItemStateChips } from "@/components/talent/services/ItemStateChips";

export type OfferingCardVariant = "list-row" | "card" | "tile" | "editorial";

const CTA: Record<string, { en: string; es: string }> = {
  book_now: { en: "Book", es: "Reservar" },
  buy_now: { en: "Buy", es: "Comprar" },
  request_to_book: { en: "Request", es: "Pedir" },
  request: { en: "Enquire", es: "Consultar" },
  ask_quote: { en: "Ask", es: "Cotizar" },
};

export function OfferingCard({
  item,
  locale,
  rates,
  variant = "card",
  showUsd = true,
  showDuration = true,
  showDeposit = true,
  showCancellation = true,
  ctaLabel,
  onSelect,
}: {
  item: TalentOffering;
  locale: string;
  rates?: UsdRates | null;
  variant?: OfferingCardVariant;
  showUsd?: boolean;
  showDuration?: boolean;
  showDeposit?: boolean;
  showCancellation?: boolean;
  ctaLabel?: string;
  onSelect?: () => void;
}) {
  const es = locale.startsWith("es");
  const price = offeringPriceLabel(item, locale);
  const usd = showUsd ? usdEquivalentLabel(item.amountCents, item.currency, rates ?? null, locale) : null;
  const cta = ctaLabel ?? CTA[resolveOfferingCta(item)]?.[es ? "es" : "en"] ?? (es ? "Seleccionar" : "Select");
  const cover = item.imageUrls[0] ?? null;
  const minutes = item.durationMinutes;
  const deposit =
    item.reserveMode === "deposit" && item.depositPct && item.amountCents
      ? Math.round((item.amountCents * item.depositPct) / 100)
      : null;

  return (
    <article
      data-offering-card={variant}
      className={
        variant === "list-row"
          ? "flex items-center gap-3 py-2"
          : variant === "editorial"
            ? "grid gap-4 md:grid-cols-2"
            : "flex flex-col gap-2"
      }
    >
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className={
            variant === "list-row"
              ? "h-12 w-12 rounded-md object-cover"
              : "aspect-square w-full rounded-lg object-cover"
          }
        />
      ) : (
        <div
          className={
            variant === "list-row"
              ? "h-12 w-12 rounded-md border border-dashed border-admin-border"
              : "aspect-square w-full rounded-lg border border-dashed border-admin-border"
          }
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-admin-display text-[16px] font-semibold text-admin-ink">{item.title}</h3>
          <ItemStateChips item={item} locale={locale} showBooking={false} />
        </div>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-[13px] text-admin-ink-muted">{item.description}</p>
        )}
        <p className="mt-2 text-[14px] font-semibold text-admin-ink">
          {price}
          {showDuration && minutes ? ` · ${minutes} min` : ""}
          {usd ? <span className="ml-1 font-normal text-admin-ink-muted">{usd}</span> : null}
        </p>
        {showDeposit && deposit != null && (
          <p className="text-[12px] text-admin-ink-muted">
            {es ? `Anticipo ${deposit / 100}` : `Deposit ${deposit / 100}`}
          </p>
        )}
        {showCancellation && item.cancellationHours != null && (
          <p className="text-[12px] text-admin-ink-muted">
            {es
              ? `Cambios gratis hasta ${item.cancellationHours} h antes`
              : `Free changes until ${item.cancellationHours} h before`}
          </p>
        )}
        <button
          type="button"
          onClick={onSelect}
          className="mt-2 rounded-full border border-admin-ink px-3 py-1 text-[12px] font-semibold"
        >
          {cta}
        </button>
      </div>
    </article>
  );
}
