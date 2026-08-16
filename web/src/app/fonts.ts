import localFont from "next/font/local";

/**
 * Self-hosted build-time faces — replaces the `next/font/google` imports
 * that used to live directly in `layout.tsx`.
 *
 * `next/font/google` fetches CSS from fonts.googleapis.com *and* the font
 * binaries from fonts.gstatic.com at build time. When either fetch flakes
 * (observed twice on 2026-08-15/16: once in CI, once locally), the
 * Turbopack build dies with "Module not found" on the generated font CSS
 * module — an upstream, intermittent failure with no code-side fix.
 *
 * These are the exact same files Google would have served for the
 * weight/style/subset config previously declared inline (verified against
 * Next's own `getFontAxes`/`getGoogleFontsUrl` output) — see
 * `./fonts/NOTICE.md` for provenance, licensing (all OFL-1.1), and the
 * latin-only subsetting rationale.
 *
 * Runtime, tenant-selectable fonts (the `GoogleFontsLink` component /
 * `GoogleFontPicker` / `fonts-registry.ts` "google" source families) are a
 * SEPARATE path: a `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`
 * rendered per-request based on a tenant's theme tokens. That path is
 * runtime-only, does not run during `next build`, and is untouched by this
 * file — it has its own (much lower-stakes) failure mode of a tenant's
 * custom heading/body font silently falling back to system-ui if
 * fonts.googleapis.com is unreachable *for that visitor's request*.
 */

export const bodySans = localFont({
  src: "./fonts/raleway.woff2",
  variable: "--font-body-sans",
  display: "swap",
  weight: "400 700",
  style: "normal",
});

export const geistMono = localFont({
  src: "./fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  weight: "100 900",
  style: "normal",
});

/** Platform surface display + UI typography. Scoped to the marketing site via `--plt-font-*`. */
export const geistSans = localFont({
  src: "./fonts/geist.woff2",
  variable: "--font-geist-sans",
  display: "swap",
  weight: "400 700",
  style: "normal",
});

export const cinzel = localFont({
  src: "./fonts/cinzel.woff2",
  variable: "--font-cinzel",
  display: "swap",
  weight: "400 700",
  style: "normal",
});

/** Legacy editorial preset used by non-marketing public surfaces. */
export const interBody = localFont({
  src: "./fonts/inter.woff2",
  variable: "--font-inter-body",
  display: "swap",
  weight: "400 700",
  style: "normal",
});

export const playfairDisplay = localFont({
  src: "./fonts/playfair-display.woff2",
  variable: "--font-playfair-display",
  display: "swap",
  weight: "400 700",
  style: "normal",
});

/**
 * M7 — editorial variable serif used by the `editorial-serif` heading preset
 * and by any storefront that opts into the Editorial Bridal theme. Hidden
 * behind a CSS var so legacy tenants on Raleway/Playfair don't pay for the
 * payload unless their heading preset references it.
 */
export const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces.woff2", weight: "100 900", style: "normal" },
    { path: "./fonts/fraunces-italic.woff2", weight: "100 900", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});
