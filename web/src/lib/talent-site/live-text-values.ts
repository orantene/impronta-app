/**
 * The values behind live text (see `live-text.ts`): pure, from real profile
 * facts, in the visitor's locale. Every value is "" when its data is missing,
 * so the renderer hides or falls back; nothing here invents a fact.
 */
import { resolveHeadline } from "./hero-headline";
import { formatHeroEyebrow, formatHeroProofLine, type HeroProofInput } from "./hero-proof-line";
import { resolveLocalizedLine } from "./live-line-language";
import type { TalentLiveText } from "./live-text";
import { pick, type LocalizedMapLike } from "./talent-locale-swaps";

export interface LiveTextSource {
  displayName: string;
  /** Primary trade name map ({ en, es }) and home city name map. */
  trade: LocalizedMapLike;
  city: LocalizedMapLike;
  /** The city as it should read (accented, from the locations table); wins over the name maps. */
  cityLabel?: string | null;
  /** `identity.headline` and `identity.tagline`, as she wrote them (her main language). */
  headline?: string | null;
  tagline?: string | null;
  /** The same two lines per language ({ es, en }), from the profile editor. */
  headlineI18n?: Readonly<Record<string, string>> | null;
  taglineI18n?: Readonly<Record<string, string>> | null;
  /** `short_bio`: the short text of her main language, the tagline's other home. */
  shortBio?: string | null;
  /** Her main language ("es" or "en"). */
  primaryLocale?: string | null;
  /** Stable per-talent key (her profile code) that picks the seeded headline variant. */
  seedKey?: string | null;
  proof: HeroProofInput;
  /** Visit facts ("place" and "hours" values) as the location section shows them. */
  place?: string | null;
  hoursDays?: string | null;
  /** Published Instagram URL, when she has one. */
  instagramHref?: string | null;
  /** A wa.me link she set herself (never built from her private phone). */
  whatsappHref?: string | null;
  /** Currency of her published services ("MXN"). */
  menuCurrency?: string | null;
}

/** "@handle" from a profile Instagram URL; "" when it does not parse. */
export function instagramHandle(href: string | null | undefined): string {
  if (!href) return "";
  try {
    const url = new URL(href);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return "";
    const seg = url.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "") ?? "";
    return /^[A-Za-z0-9._]{1,30}$/.test(seg) ? `@${seg}` : "";
  } catch {
    return "";
  }
}

/** Footer contact line with real links (the paragraph renders `[text](url)`): Instagram handle, WhatsApp click-to-chat. */
export function contactLine(handle: string, instagramHref?: string | null, whatsappHref?: string | null): string {
  const parts: string[] = [];
  if (handle) {
    const url = instagramHref && /^https:\/\//i.test(instagramHref) ? instagramHref : `https://instagram.com/${handle.slice(1)}`;
    parts.push(`Instagram · [${handle}](${url})`);
  }
  if (whatsappHref && /^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(whatsappHref)) parts.push(`[WhatsApp](${whatsappHref})`);
  return parts.join(" · ");
}

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export function buildTalentLiveText(
  src: LiveTextSource,
  locale: string | null | undefined,
  chain: readonly string[] = [],
): TalentLiveText {
  const es = (locale ?? "").trim().toLowerCase().startsWith("es");
  const key = es ? "es" : "en";
  const tradeEn = src.trade?.en?.trim() ?? "";
  const tradeNow = pick(src.trade, key, chain);
  const cityNow = src.cityLabel?.trim() || pick(src.city, key, chain);
  const cityEn = src.city?.en?.trim() ?? "";

  const primary = (src.primaryLocale ?? "").toLowerCase().startsWith("en") ? "en" : "es";
  // Her own words per language: the map, the plain field, `short_bio`; never English for a Spanish visitor when a Spanish line exists.
  const ownHeadline = resolveLocalizedLine({ map: src.headlineI18n, plain: src.headline, locale: key, primary });
  const ownTagline = resolveLocalizedLine({ map: src.taglineI18n, plain: src.tagline, alt: src.shortBio, locale: key, primary });
  const headline = resolveHeadline({ headline: ownHeadline, tradeEn, displayName: src.displayName, seedKey: src.seedKey }, key);
  const eyebrow = formatHeroEyebrow(tradeNow, cityNow);
  const proof = formatHeroProofLine(src.proof, key);
  const instagram = instagramHandle(src.instagramHref);
  const intro = tradeNow && cityNow ? (es ? `${tradeNow} en ${cityNow}.` : `${tradeNow} in ${cityNow}.`) : "";
  const hours = src.hoursDays?.trim()
    ? es
      ? `Con cita, ${lowerFirst(src.hoursDays.trim())}`
      : `By appointment, ${src.hoursDays.trim()}`
    : "";

  const cityEs = src.city?.es?.trim() ?? "";
  const tradeEs = src.trade?.es?.trim() ?? "";
  const eyebrows = new Set(
    [
      tradeEn,
      tradeEs,
      formatHeroEyebrow(tradeEn, cityEn),
      formatHeroEyebrow(tradeEs, cityEs),
      formatHeroEyebrow(tradeNow, cityNow),
    ].filter(Boolean),
  );

  const currency = src.menuCurrency?.trim().toUpperCase();
  return {
    trades: [tradeEn, tradeEs].filter(Boolean),
    // The trade as the visitor's language names it ("Manicurista"): the header lockup under her name.
    tradeLabel: tradeNow,
    menuSubtitle: currency ? (es ? `Precios en ${currency}.` : `Prices in ${currency}.`) : "",
    values: {
      // Her own words win; a seeded line follows the locale; the name fallback is the stored text.
      hero_headline: headline.source === "name" ? "" : headline.text,
      hero_eyebrow: eyebrow,
      hero_tagline: ownTagline,
      hero_proof: proof,
      footer_intro: intro,
      footer_where: src.place?.trim() ?? "",
      footer_hours: hours,
      footer_contact: contactLine(instagram, src.instagramHref, src.whatsappHref),
    },
    // Only the lines that follow the profile on sites applied before 2.7 need their baked forms.
    seeds: {
      hero_eyebrow: [...eyebrows],
      hero_proof: [
        cityEn ? `Based in ${cityEn}` : "",
        cityEs ? `Con base en ${cityEs}` : "",
        cityEs ? `Based in ${cityEs}` : "",
        formatHeroProofLine(src.proof, "en"),
        formatHeroProofLine(src.proof, "es"),
      ].filter(Boolean),
    },
  };
}
