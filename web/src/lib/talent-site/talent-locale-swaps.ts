/**
 * Applied Designs bake the talent's profile copy into the saved tree in
 * English (bio, trade label, city), so a Spanish site showed "I studied
 * engineering..." and "NAIL ARTIST". The renderer swaps each UNTOUCHED seeded
 * English value for the site-locale version at render time (same contract as
 * `design-label-locale.ts`): an exact match is rewritten, anything the talent
 * edited is left alone, and no reapply is needed. Pure; the loader lives in
 * `server/talent-locale-swaps.server.ts`.
 */

import { accentHeadline, seedHeadlineFor } from "./hero-headline";
import { formatHeroEyebrow, formatHeroProofLine, type HeroProofInput } from "./hero-proof-line";

export type LocalizedMapLike = Readonly<Record<string, string | null | undefined>> | null | undefined;

export interface TalentLocaleSwapSource {
  bioI18n: LocalizedMapLike;
  /** Talent-type taxonomy name maps (primary first). */
  typeNames: ReadonlyArray<LocalizedMapLike>;
  homeCity: LocalizedMapLike;
  /**
   * Other spellings the baked English copy may carry for the home city (the
   * ASCII-folded place text, "Cancun"). Each swaps to the localized city the
   * same way `homeCity.en` does, so an older applied tree gains its accent.
   */
  cityAliases?: ReadonlyArray<string>;
  /**
   * Published service titles. The marquee, the service cards and every other
   * baked list carry the English title; it swaps to the title for the locale
   * (`title_i18n`), walking the same chain as the bio.
   */
  offerings?: ReadonlyArray<{ title: string | null; titleI18n: LocalizedMapLike }>;
  /**
   * The facts behind the hero proof line. When present, the English line baked
   * into the applied tree swaps to its Spanish form (the line has numbers and
   * language names in it, so no exact-label map could cover it).
   */
  proof?: HeroProofInput;
  /** Her profile code: picks the same seeded headline variant the token projection used. */
  seedKey?: string | null;
}

/** The hero tagline length the token projection clamps to. */
export const TAGLINE_MAX = 160;

/**
 * The value for `locale`, walking the talent's fallback `chain` (visitor,
 * primary, ...) and then English, the language the seed was baked in.
 */
export function pick(map: LocalizedMapLike, locale: string, chain: readonly string[] = []): string {
  for (const code of [locale, ...chain]) {
    const v = map?.[localeKey(code)]?.trim();
    if (v) return v;
  }
  return map?.en?.trim() || "";
}

/** Clamp on a word boundary with an ellipsis; never cuts mid-word. */
export function clampWords(text: string, max: number = TAGLINE_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  const head = (at > max * 0.5 ? cut.slice(0, at) : t.slice(0, max)).replace(/[\s,;:.\-–]+$/, "");
  return `${head}…`;
}

function localeKey(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2) || "en";
}

/**
 * English seeded value -> value for `locale`. Also maps the legacy mid-word
 * tagline (a raw 160-char slice) to its word-clamped form, in every locale.
 */
export function buildTalentLocaleSwaps(
  src: TalentLocaleSwapSource,
  locale: string | null | undefined,
  /** The talent's fallback chain for `locale` ([visitor, primary, ...]). */
  chain: readonly string[] = [],
): Record<string, string> {
  const key = localeKey(locale);
  const out: Record<string, string> = {};
  const add = (from: string, to: string) => {
    const f = from.trim();
    if (f && to && f !== to) out[f] = to;
  };

  const bioEn = src.bioI18n?.en?.trim() ?? "";
  const bio = pick(src.bioI18n, key, chain);
  if (bioEn) {
    add(bioEn, bio);
    // Legacy tagline token: `publicBio.slice(0, 160)`.
    add(bioEn.slice(0, TAGLINE_MAX), clampWords(bio));
    add(clampWords(bioEn), clampWords(bio));
  }
  for (const names of src.typeNames) {
    const en = names?.en?.trim();
    if (en) add(en, pick(names, key, chain));
  }
  const cityEn = src.homeCity?.en?.trim();
  const cityNames = [cityEn, ...(src.cityAliases ?? [])].map((c) => c?.trim() ?? "").filter(Boolean);
  if (cityEn || cityNames.length) {
    const city = pick(src.homeCity, key, chain) || cityNames[0]!;
    for (const name of new Set(cityNames)) {
      add(name, city);
      if (key === "es") add(`Based in ${name}`, `Con base en ${city}`);
    }
  }
  for (const o of src.offerings ?? []) {
    const en = (o.titleI18n?.en ?? o.title ?? "").trim();
    if (en) add(en, pick(o.titleI18n, key, chain));
  }
  // The hero eyebrow is the trade and the city joined ("Nail Artist · Mérida"): a value of its own.
  const tradeEn = src.typeNames[0]?.en?.trim();
  if (tradeEn) {
    const city = pick(src.homeCity, key, chain) || cityNames[0] || "";
    for (const name of new Set(cityNames)) {
      add(formatHeroEyebrow(tradeEn, name), formatHeroEyebrow(pick(src.typeNames[0], key, chain), city));
    }
  }
  // The hero headline seeded from her trade ("Hands that {i}speak{/i} for you.") has a Spanish form.
  const seed = seedHeadlineFor(tradeEn, src.seedKey);
  if (seed && key === "es") add(accentHeadline(seed.en), accentHeadline(seed.es));
  if (src.proof && key === "es") {
    add(formatHeroProofLine(src.proof, "en"), formatHeroProofLine(src.proof, "es"));
  }
  return out;
}
