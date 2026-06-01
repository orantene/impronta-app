import {
  BUILDER_FONT_REGISTRY,
  buildGoogleFontsHrefForFamilies,
  collectBuilderNodeFontFamilies,
  resolveBuilderFont,
} from "../../src/lib/site-admin/builder-node/fonts-registry";
import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";

/**
 * Font bridge for the fidelity harness.
 *
 * The standalone capture HTML is NOT a Next.js page, so the `var(--font-X)`
 * custom properties that `next/font` defines in `app/layout.tsx` do not exist.
 * Bundled registry faces (Geist/Inter/Raleway/Cinzel/Playfair/Fraunces) would
 * therefore silently fall back to the system serif/sans — which means
 * Typography would be scored on Georgia/Arial glyphs instead of the real face.
 * That is exactly the dishonesty P4 is removing.
 *
 * This module resolves every registry family a design declares and produces:
 *  - self-hosted `@font-face` rules for BUNDLED faces, pointing at committed
 *    woff2 files under `scripts/fidelity/fonts/` (offline + deterministic), and
 *  - the `--font-X` var definitions the renderer's `cssFamily` strings expect, and
 *  - a Google Fonts `<link>` href for GOOGLE-source faces (CI has network).
 *
 * It also returns `requiredFamilies` — the registry families that MUST end up
 * loaded — so `capture.ts` can fail the capture if any fell back to a system
 * font. System families a design declares on purpose (e.g. Georgia, Menlo) are
 * not registry faces, so they are intentionally excluded from the self-check.
 */

/** Bundled registry family → committed woff2 file + the renderer's expected `--font-*` var. */
const BUNDLED_FONT_ASSETS: Readonly<Record<string, { file: string; cssVar: string }>> = {
  Geist: { file: "geist.woff2", cssVar: "--font-geist-sans" },
  "Geist Mono": { file: "geist-mono.woff2", cssVar: "--font-geist-mono" },
  Raleway: { file: "raleway.woff2", cssVar: "--font-body-sans" },
  Inter: { file: "inter.woff2", cssVar: "--font-inter-body" },
  Cinzel: { file: "cinzel.woff2", cssVar: "--font-cinzel" },
  "Playfair Display": { file: "playfair-display.woff2", cssVar: "--font-playfair-display" },
  Fraunces: { file: "fraunces.woff2", cssVar: "--font-fraunces" },
};

// Registry-drift guard: if someone adds a bundled face to the registry without a
// committed woff2 here, the harness would silently fall back for it. Fail loud at
// import time instead — the harness is the thing that proves fonts are honest.
for (const font of BUILDER_FONT_REGISTRY) {
  if (font.source === "bundled" && !BUNDLED_FONT_ASSETS[font.family]) {
    throw new Error(
      `fidelity fonts-bridge: bundled registry family "${font.family}" has no self-hosted woff2. ` +
        `Add it to scripts/fidelity/fonts/ + BUNDLED_FONT_ASSETS, or the fidelity harness will score it on a system fallback.`,
    );
  }
}

// IMPORTANT: this module is in the Playwright e2e import graph (via html.ts),
// which transpiles to CJS — so it must NOT use `import.meta` / node path APIs.
// capture.ts (ESM-only) computes the absolute `file://` base and passes it in.
//
// The relative default resolves the woff2 against the HTML file's own URL. The
// fidelity capture writes its HTML under `web/fidelity/<design>/`, from which
// `../../scripts/fidelity/fonts/` points back at the committed assets. It is only
// used when a caller renders bundled-font HTML without an explicit base.
const DEFAULT_FONTS_BASE_URL = "../../scripts/fidelity/fonts/";

export interface FidelityFontPlan {
  /**
   * Registry families the design declares that must render with their real
   * face. `capture.ts` asserts each is loaded (vs a system fallback).
   */
  requiredFamilies: string[];
  /** Google Fonts stylesheet href for google-source families, or null. */
  googleHref: string | null;
  /** `<head>` markup (preconnect + link + @font-face/var `<style>`), or "". */
  headHtml: string;
}

export interface PlanFidelityFontsOptions {
  /** Override the woff2 base URL (trailing slash). Defaults to the committed assets via `file://`. */
  fontsBaseUrl?: string;
}

/**
 * Inspect a BuilderNode tree, resolve the registry faces it declares, and build
 * the head markup + self-check list needed to render those faces honestly.
 */
export function planFidelityFonts(
  nodes: ReadonlyArray<BuilderNode>,
  options: PlanFidelityFontsOptions = {},
): FidelityFontPlan {
  const fontsBaseUrl = options.fontsBaseUrl ?? DEFAULT_FONTS_BASE_URL;
  const declared = collectBuilderNodeFontFamilies(nodes);

  const requiredFamilies: string[] = [];
  const requiredSeen = new Set<string>();
  const bundledNeeded = new Map<string, { file: string; cssVar: string }>();
  let hasGoogle = false;

  for (const value of declared) {
    const def = resolveBuilderFont(value);
    if (!def) continue; // system / generic family declared on purpose — not ours
    if (!requiredSeen.has(def.family)) {
      requiredSeen.add(def.family);
      requiredFamilies.push(def.family);
    }
    if (def.source === "bundled") {
      bundledNeeded.set(def.family, BUNDLED_FONT_ASSETS[def.family]);
    } else {
      hasGoogle = true;
    }
  }

  const googleHref = hasGoogle ? buildGoogleFontsHrefForFamilies(declared) : null;

  const faceRules = [...bundledNeeded.entries()].map(
    ([family, asset]) =>
      `@font-face{font-family:"${family}";src:url("${fontsBaseUrl}${asset.file}") format("woff2");font-weight:400 700;font-style:normal;font-display:block;}`,
  );
  // Define the `--font-*` vars so the renderer's cssFamily strings
  // (e.g. '"Fraunces", var(--font-fraunces), Georgia, serif') resolve to the
  // real face even when a design references the var rather than the bare name.
  const varDefs =
    bundledNeeded.size > 0
      ? `:root{${[...bundledNeeded.entries()]
          .map(([family, asset]) => `${asset.cssVar}:"${family}";`)
          .join("")}}`
      : "";

  const styleBody = [...faceRules, varDefs].filter(Boolean).join("\n");

  const headParts: string[] = [];
  if (googleHref) {
    headParts.push(
      '<link rel="preconnect" href="https://fonts.googleapis.com" />',
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
      `<link rel="stylesheet" href="${escapeAttr(googleHref)}" data-fidelity-google-fonts="" />`,
    );
  }
  if (styleBody) {
    headParts.push(`<style data-fidelity-bundled-fonts="">\n${styleBody}\n</style>`);
  }

  return {
    requiredFamilies,
    googleHref,
    headHtml: headParts.join("\n"),
  };
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
