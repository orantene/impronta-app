/**
 * TUL-15: a photo caption the talent wrote in one language only. When the
 * visitor's language has no caption and the primary-language caption is shown
 * instead, a small muted line names the caption's language: "(en español)"
 * under a Spanish caption, "(in English)" under an English one. The walk and
 * the language names come from the bio's helper (`bio-language-hint.ts`), so
 * captions and bios agree. Nothing is translated; alt text is never touched.
 *
 * Pure (no React / no IO).
 */
import { localizeLanguageName } from "@/lib/i18n/language-names";
import { bioFallbackLanguage, ENGLISH_NAME } from "@/lib/talent-site/bio-language-hint";

import { readPortfolioI18nMap } from "./portfolio-i18n";

function key(locale: string | null | undefined): string {
  return (locale ?? "").trim().toLowerCase().slice(0, 2);
}

/** `{ captionI18n }` for a shot, only when the media carries a non-empty map. */
export function captionMapField(
  metadata: Record<string, unknown> | null | undefined,
): { captionI18n?: Readonly<Record<string, string>> } {
  const raw = readPortfolioI18nMap(metadata?.caption_i18n);
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const [code, value] of Object.entries(raw)) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) out[key(code)] = text;
  }
  return Object.keys(out).length ? { captionI18n: out } : {};
}

/**
 * The hint line, or null when none is needed: no caption, the visitor's own
 * language exists (or IS the primary one), or the primary language is unknown.
 */
export function captionLanguageHint(args: {
  caption: string | null | undefined;
  captionI18n: Readonly<Record<string, string>> | null | undefined;
  locale: string | null | undefined;
  primaryLocale: string | null | undefined;
}): string | null {
  if (!args.caption?.trim()) return null;
  const visitor = key(args.locale);
  const primary = key(args.primaryLocale);
  if (!visitor || !primary || visitor === primary) return null;
  const shown = bioFallbackLanguage(
    { ...(args.captionI18n ?? {}), [primary]: args.caption },
    visitor,
    [primary],
  );
  if (!shown) return null;
  const name = localizeLanguageName(shown, ENGLISH_NAME[shown] ?? shown.toUpperCase(), shown);
  return shown === "es" ? `(en ${name.toLowerCase()})` : `(in ${name})`;
}
