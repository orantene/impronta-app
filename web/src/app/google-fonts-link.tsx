/**
 * Phase 13 — storefront Google Fonts link injector.
 *
 * The Theme Drawer's GoogleFontPicker writes free-string font-family
 * values into two tokens (`typography.heading-font-family`,
 * `typography.body-font-family`), and the Header inspector writes a third
 * (`shell.header-nav-font`). The storefront must then load the
 * actual font files, which Next's font helpers can't do at runtime
 * (they're build-time only). This component renders a server-side
 * `<link rel="stylesheet">` against fonts.googleapis.com for whatever
 * families the tokens resolve to.
 *
 * Empty token → no link. Already-loaded built-in family
 * (Geist/Cinzel/Playfair/Inter/Fraunces, all bundled via next/font in
 * root layout) → no extra link. Anything else → a single combined
 * Google Fonts URL with both families.
 *
 * SSR-only (no client deps), runs inside the root layout.
 */

import { buildGoogleFontsHrefForFamilies } from "@/lib/site-admin/builder-node/fonts-registry";

interface GoogleFontsLinkProps {
  tokens: Record<string, string>;
  fontFamilies?: ReadonlyArray<string | undefined | null>;
}

export function GoogleFontsLink({ tokens, fontFamilies = [] }: GoogleFontsLinkProps) {
  const wanted: string[] = [];
  for (const key of [
    "typography.heading-font-family",
    "typography.body-font-family",
    // The header nav can override the site font (Header inspector → Style →
    // Typography). Without this entry the token would be stored and projected
    // but the FILE would never load, so the nav would silently fall back — a
    // capability wired at three layers out of four.
    "shell.header-nav-font",
  ] as const) {
    if (tokens[key]) wanted.push(tokens[key]);
  }
  const href = buildGoogleFontsHrefForFamilies([...wanted, ...fontFamilies]);
  if (!href) return null;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={href} />
    </>
  );
}
