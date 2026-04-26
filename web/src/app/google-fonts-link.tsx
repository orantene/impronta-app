/**
 * Phase 13 — storefront Google Fonts link injector.
 *
 * The Theme Drawer's GoogleFontPicker writes free-string font-family
 * values into two tokens (`typography.heading-font-family`,
 * `typography.body-font-family`). The storefront must then load the
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

const BUNDLED = new Set([
  "geist",
  "cinzel",
  "inter",
  "playfair display",
  "fraunces",
  "geist mono",
]);

function firstFamily(value: string | undefined | null): string | null {
  if (!value) return null;
  const m = value.match(/^"?([^",]+)"?/);
  if (!m) return null;
  const trimmed = m[1].trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface GoogleFontsLinkProps {
  tokens: Record<string, string>;
}

export function GoogleFontsLink({ tokens }: GoogleFontsLinkProps) {
  const wanted: string[] = [];
  for (const key of [
    "typography.heading-font-family",
    "typography.body-font-family",
  ] as const) {
    const family = firstFamily(tokens[key]);
    if (!family) continue;
    if (BUNDLED.has(family.toLowerCase())) continue;
    if (!wanted.includes(family)) wanted.push(family);
  }
  if (wanted.length === 0) return null;
  // wght@400;500;600;700 covers the typical headline / body weights the
  // section CSS reaches for. Display=swap matches our existing fonts.
  const familyParams = wanted
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&");
  const href = `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={href} />
    </>
  );
}
