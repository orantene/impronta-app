/**
 * TUL-15 / TUL-187: a photo caption the talent wrote in one language only. When
 * the visitor's language has no caption and the primary-language caption is
 * shown instead, a small muted line names the caption's language. ONE hint
 * style everywhere: captions use the bio's helper (`bio-language-hint.ts`) —
 * "Disponible en español" / "Disponible en inglés". Nothing is translated; alt
 * text is never touched. The same hint rides on the lightbox caption.
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
 * language exists (or IS the primary one), or we cannot name a source language.
 */
export function captionLanguageHint(args: {
  caption: string | null | undefined;
  captionI18n: Readonly<Record<string, string>> | null | undefined;
  locale: string | null | undefined;
  primaryLocale: string | null | undefined;
}): string | null {
  if (!args.caption?.trim()) return null;
  const visitor = key(args.locale);
  if (!visitor) return null;
  let primary = key(args.primaryLocale);
  // When the page forgot primaryLocale, infer from the sole other map key so a
  // Spanish-only caption on /en never stays silent (TUL-187).
  if (!primary) {
    const others = Object.entries(args.captionI18n ?? {})
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([k]) => key(k))
      .filter((k) => k && k !== visitor);
    if (others.length === 1) primary = others[0]!;
  }
  if (!primary || visitor === primary) return null;
  // ONE hint style everywhere: the bio's helper ("Disponible en español").
  return bioLanguageHint({ ...(args.captionI18n ?? {}), [primary]: args.caption }, visitor, [primary]);
}
