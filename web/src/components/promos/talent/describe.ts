import type { PromoCopy } from "@/lib/promos/copy/talent";
import { formatMoney, formatShortDate } from "@/lib/promos/talent-view";
import { instantToLocalDate } from "@/lib/promos/templates";
import type { Promo } from "@/lib/promos/types";

/** "20% menos", "$90 menos", "Extra gratis". */
export function offerLabel(p: Pick<Promo, "offer_kind" | "value" | "currency">, copy: PromoCopy): string {
  switch (p.offer_kind) {
    case "percent": return copy.t("offer.percent", { n: p.value });
    case "fixed": return copy.t("offer.fixed", { amount: formatMoney(p.value, p.currency, copy.locale) });
    case "fixed_price": return copy.t("offer.fixed_price", { amount: formatMoney(p.value, p.currency, copy.locale) });
    case "free_addon": return copy.t("offer.free_addon");
  }
}

/** "lun, mar" or "Todos los días". */
export function daysLabel(days: readonly number[] | null | undefined, copy: PromoCopy): string {
  if (!days || days.length === 0) return copy.t("card.all_days");
  const names = [...days].sort((a, b) => a - b).map((d) => copy.t(`weekday.${d}` as "weekday.0"));
  return names.join(", ");
}

/** One short schedule line for a card: dates, or the weekdays for an open-ended repeat. */
export function scheduleLine(p: Pick<Promo, "starts_at" | "ends_at" | "tz" | "weekdays">, copy: PromoCopy): string {
  const end = instantToLocalDate(p.ends_at ?? null, p.tz);
  const start = instantToLocalDate(p.starts_at ?? null, p.tz);
  const days = p.weekdays && p.weekdays.length > 0 ? copy.t("card.every", { days: daysLabel(p.weekdays, copy) }) : null;
  const when = end
    ? copy.t("card.ends", { date: formatShortDate(end, copy.locale) })
    : start
      ? copy.t("card.starts", { date: formatShortDate(start, copy.locale) })
      : copy.t("card.open_ended");
  return days ? `${days} · ${when}` : when;
}
