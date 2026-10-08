/**
 * TUL-15: a photo caption the talent wrote in one language only. When the visitor's language has no
 * caption and the primary-language caption is shown instead, a small muted line names the caption's
 * language. ONE hint style everywhere: captions use the bio's helper (`bio-language-hint.ts`) and its
 * wording, "(Text in Spanish)" for an English visitor, "(Texto en inglés)" for a Spanish one. Nothing is
 * translated; alt text is never touched. The same hint rides on the lightbox caption.
 *
 * Pure (no React / no IO).
 */
import { bioLanguageHint } from "@/lib/talent-site/bio-language-hint";

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
  // ONE hint style everywhere: the bio's helper ("(Text in Spanish)" / "(Texto en inglés)").
  return bioLanguageHint({ ...(args.captionI18n ?? {}), [primary]: args.caption }, visitor, [primary]);
}
