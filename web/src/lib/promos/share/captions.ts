import type { Promo } from "@/lib/promos/types";
import { formatPrice } from "@/lib/money/format-price";

export type ShareLang = "es" | "en";

const DAYS: Record<ShareLang, readonly string[]> = {
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

function money(cents: number, currency: string, lang: ShareLang): string {
  return formatPrice({ amountCents: cents, currency, locale: lang }).primary;
}

/** Big offer text: "20% de descuento", "$100 de descuento", "Gel gratis". */
export function offerHeadline(p: Promo, lang: ShareLang, addonName?: string | null): string {
  switch (p.offer_kind) {
    case "percent": {
      const n = Number.isInteger(p.value) ? String(p.value) : String(p.value);
      return lang === "es" ? `${n}% de descuento` : `${n}% off`;
    }
    case "fixed":
      return lang === "es" ? `${money(p.value, p.currency, lang)} de descuento` : `${money(p.value, p.currency, lang)} off`;
    case "fixed_price":
      return lang === "es" ? `Por ${money(p.value, p.currency, lang)}` : `Only ${money(p.value, p.currency, lang)}`;
    case "free_addon":
      return addonName
        ? lang === "es" ? `${addonName} gratis` : `Free ${addonName}`
        : lang === "es" ? "Un extra gratis" : "A free extra";
  }
}

/** The short badge: "-20%". Money offers fall back to the headline. */
export function offerBadge(p: Promo, lang: ShareLang, addonName?: string | null): string {
  return p.offer_kind === "percent" ? `-${p.value}%` : offerHeadline(p, lang, addonName);
}

/** "lunes a miércoles" for 3+ consecutive days, otherwise "lunes y jueves". */
export function weekdaysText(days: readonly number[] | null | undefined, lang: ShareLang): string | null {
  if (!days || days.length === 0 || days.length === 7) return null;
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const names = sorted.map((d) => DAYS[lang][d]!);
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1]! + 1);
  const to = lang === "es" ? "a" : "to";
  const and = lang === "es" ? "y" : "and";
  if (sorted.length >= 3 && consecutive) return `${names[0]} ${to} ${names[names.length - 1]}`;
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}

/** The condition line on the visuals: "lunes a miércoles · solo 3 lugares". */
export function conditionLine(p: Promo, lang: ShareLang, spotsLeft?: number | null): string | null {
  const parts: string[] = [];
  const wd = weekdaysText(p.weekdays, lang);
  if (wd) parts.push(wd);
  const spots = spotsLeft ?? p.max_uses ?? null;
  if (spots !== null && spots > 0) {
    parts.push(lang === "es" ? `solo ${spots} ${spots === 1 ? "lugar" : "lugares"}` : `only ${spots} ${spots === 1 ? "spot" : "spots"}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Pre-written caption for the share sheet. ES/EN, no em dashes. */
export function buildCaption(input: {
  promo: Promo;
  lang: ShareLang;
  link: string;
  addonName?: string | null;
  spotsLeft?: number | null;
  hashtags?: readonly string[];
}): string {
  const { promo, lang, link } = input;
  const offer = offerHeadline(promo, lang, input.addonName);
  const cond = conditionLine(promo, lang, input.spotsLeft);
  const head =
    lang === "es"
      ? `Tengo espacios disponibles ✨ ${offer}${cond ? `, ${cond}` : ""}.`
      : `I have openings ✨ ${offer}${cond ? `, ${cond}` : ""}.`;
  const cta = lang === "es" ? `Reserva aquí: ${link}` : `Book here: ${link}`;
  const tags = (input.hashtags ?? []).map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
  return [head, cta, tags].filter(Boolean).join("\n");
}
