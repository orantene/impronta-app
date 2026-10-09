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
 * TUL-495 — NON-BLOCKING by default. Talent Max sites mount this link in
 * the BODY just above header/main. A render-blocking stylesheet there holds
 * first paint of the whole site until `/api/fonts/css` returns (often 1s+
 * cold, longer when queued behind dozens of async chunks). Preload +
 * `media="print"` → swap to `all` on load keeps text painting with system
 * fallbacks (`font-display: swap` on the faces) while the CSS arrives.
 *
 * SSR-only (no client deps), runs inside the root layout and Max-site render.
 */

import { toFontProxyHref } from "@/lib/fonts/google-proxy";
import {
  buildGoogleFontsHrefFromUsage,
  THEME_TOKEN_FONT_WEIGHTS,
} from "@/lib/site-admin/builder-node/fonts-catalog";

interface GoogleFontsLinkProps {
  tokens: Record<string, string>;
  fontFamilies?: ReadonlyArray<string | undefined | null>;
  /**
   * When true (default), the stylesheet does not block first paint.
   * Pass false only for surfaces that must have the face before paint
   * (none today; kept for an explicit opt-out).
   */
  blocking?: boolean;
}

export function GoogleFontsLink({
  tokens,
  fontFamilies = [],
  blocking = false,
}: GoogleFontsLinkProps) {
  const wanted: Array<{ value: string; italic: boolean; stretch: boolean }> = [];
  // A wide heading (`type.stretch` above 100%, or the utility type system) needs the
  // `wdth` axis, or `font-stretch` silently does nothing. Heading + body only.
  const stretchPct = Number.parseFloat(tokens["type.stretch"] ?? "");
  const wide = tokens["type.system"] === "utility" || (Number.isFinite(stretchPct) && stretchPct > 100);
  for (const key of [
    "typography.heading-font-family",
    "typography.body-font-family",
    // The header nav can override the site font (Header inspector → Style →
    // Typography). Without this entry the token would be stored and projected
    // but the FILE would never load, so the nav would silently fall back — a
    // capability wired at three layers out of four.
    "shell.header-nav-font",
  ] as const) {
    // Display headings use genuine italics for accents (`{i}`); request
    // them only for the heading face (the builder skips families without).
    if (tokens[key]) {
      wanted.push({
        value: tokens[key],
        italic: key === "typography.heading-font-family",
        stretch: wide && key !== "shell.header-nav-font",
      });
    }
  }
  // Usage-aware builder: weights are clamped to what each family actually
  // ships (an unsupported weight 400s the whole css2 stylesheet), variable
  // families load one ranged file, and families the catalogue does not know
  // (tenant-uploaded faces, served by TenantFontFaces) are skipped.
  const href = buildGoogleFontsHrefFromUsage(
    [
      ...wanted.map((w) => ({ ...w, weights: THEME_TOKEN_FONT_WEIGHTS })),
      ...fontFamilies.map((value) => ({
        value: value ?? "",
        weights: THEME_TOKEN_FONT_WEIGHTS,
      })),
    ],
  );
  if (!href) return null;
  const proxied = toFontProxyHref(href);
  if (blocking) {
    return <link rel="stylesheet" href={proxied} />;
  }
  // Preload starts the fetch early; media=print keeps the link out of the
  // render-blocking set until onload flips it to all. A tiny inline script
  // (no client component) flips media; noscript keeps the face for no-JS.
  return (
    <>
      <link rel="preload" as="style" href={proxied} />
      <link
        rel="stylesheet"
        href={proxied}
        media="print"
        data-talent-font-stylesheet=""
      />
      <script
        data-talent-font-stylesheet-activate=""
        dangerouslySetInnerHTML={{
          __html:
            "(function(){var l=document.querySelector('link[data-talent-font-stylesheet]');" +
            "if(!l)return;function go(){l.media='all';}" +
            "if(l.sheet)go();else l.addEventListener('load',go);})();",
        }}
      />
      <noscript>
        <link rel="stylesheet" href={proxied} />
      </noscript>
    </>
  );
}
