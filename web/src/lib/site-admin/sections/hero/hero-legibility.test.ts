/**
 * Wave 7 follow-up — hero copy legibility contract.
 *
 * Live QA of the seeded Free starter (qa-wave7-starter, 2026-08-06) found
 * the hero headline rendering near-black ink DIRECTLY on the hero photo:
 *
 *   headline color   oklab(0.210531 ...)          (near-black)
 *   subtitle color   oklab(0.177637 ... / 0.88)   (near-black, 88% alpha)
 *   text-shadow      rgba(0,0,0,0.35) 0 2px 24px  (dark shadow, dark text)
 *   backing layers   getComputedStyle(.site-hero__overlay).backgroundImage
 *                    === "none"
 *
 * Root cause: the decorative overlay flavors are built from
 * `--token-color-background`, which is absent from the html token defaults,
 * and whose `var(--background)` fallback is itself invalid on a storefront.
 * A single unresolvable var makes the whole `background` shorthand
 * invalid-at-computed-value-time, so the "scrim" silently painted nothing.
 *
 * The fix is `.site-hero__scrim`: a literal-color wash the component renders
 * for every photographic hero, plus an on-scrim light copy pair. This file
 * pins that contract so it cannot silently regress the same way:
 *
 *   1. the component renders a backing layer whenever the hero has a photo
 *   2. the scrim's own colors are literal, never tenant tokens
 *   3. the copy over it is light, and its text-shadow polarity matches
 *   4. the worst case (a pure-WHITE photo) still clears a contrast floor
 *
 * Source-text assertions on purpose: the Component is a server component
 * with a large dependency graph, and the CSS is plain global CSS. Both are
 * the actual shipped artifacts, so grepping them is a real contract, and
 * it keeps this file out of the lib -> edit-chrome import cycle guard.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const componentSrc = readFileSync(resolve(here, "Component.tsx"), "utf-8");
// Path: sections/hero -> sections -> site-admin -> lib -> src
const css = readFileSync(resolve(here, "../../../..", "app/globals.css"), "utf-8");

/**
 * Extract the DECLARATIONS of a rule whose selector list matches exactly.
 * Comments are stripped: several of these rules explain in prose why a
 * property is absent, and a naive grep would read that as the property.
 */
function ruleBody(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  assert.ok(at !== -1, `globals.css must define a \`${selector}\` rule`);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  assert.ok(close !== -1, `\`${selector}\` rule is unterminated`);
  return css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
}

/** WCAG 2.x relative luminance of an 8-bit sRGB triple. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite `src` at `alpha` over `dst` (simple source-over, no gamma). */
function over(
  src: [number, number, number],
  alpha: number,
  dst: [number, number, number],
): [number, number, number] {
  return [0, 1, 2].map((i) => src[i] * alpha + dst[i] * (1 - alpha)) as [
    number,
    number,
    number,
  ];
}

const WHITE: [number, number, number] = [255, 255, 255];
/** The scrim ink, `rgba(9, 9, 11, ...)` in globals.css. */
const SCRIM_INK: [number, number, number] = [9, 9, 11];
/** `--site-hero-on-scrim`, #f8fafc. */
const ON_SCRIM: [number, number, number] = [248, 250, 252];
/** `--site-hero-on-scrim-muted`, rgba(248, 250, 252, 0.92). */
const ON_SCRIM_MUTED_ALPHA = 0.92;

test("the hero component renders a backing layer for every photographic hero", () => {
  assert.ok(
    componentSrc.includes('className="site-hero__scrim"'),
    "hero/Component.tsx must render the .site-hero__scrim legibility layer",
  );
  assert.ok(
    /hasPhotoBackdrop \?\s*\(?\s*<div className="site-hero__scrim"/.test(
      componentSrc,
    ),
    "the scrim must be gated on hasPhotoBackdrop, so it renders for image AND slider heroes",
  );
  assert.ok(
    /const hasPhotoBackdrop = hasSlides/.test(componentSrc),
    "hasPhotoBackdrop must track the presence of hero slides",
  );
  // The scrim must NOT be gated on the overlay flavor: a tenant choosing
  // `overlay: "none"` (or any decorative flavor) still gets the guarantee.
  const scrimAt = componentSrc.indexOf('className="site-hero__scrim"');
  const gateWindow = componentSrc.slice(Math.max(0, scrimAt - 200), scrimAt);
  assert.ok(
    !gateWindow.includes("effectiveOverlay"),
    "the legibility scrim must not depend on the decorative overlay flavor",
  );
});

test("the scrim is built from literal colors, never from tenant tokens", () => {
  // This is the whole point: a var() chain is what collapsed to
  // `background: none` and produced the illegible hero in the first place.
  const body = ruleBody(".site-hero__scrim");
  assert.ok(
    !body.includes("var(--token-"),
    "the legibility scrim must not reference tenant color tokens (they can be unset and collapse the whole shorthand)",
  );
  assert.ok(
    !body.includes("var(--background") && !body.includes("var(--foreground"),
    "the legibility scrim must not reference the semantic background/foreground vars",
  );
  assert.ok(
    body.includes("rgba(9, 9, 11"),
    "the legibility scrim must paint literal rgba ink",
  );
  assert.ok(
    /z-index:\s*1/.test(body) && /position:\s*absolute/.test(body),
    "the scrim must sit absolutely between the photo (z 0) and the copy (z 2)",
  );
});

test("hero copy over a photo is light, with matching text-shadow polarity", () => {
  const onScrimPair = ruleBody(
    '.site-hero[data-hero-variant="image"],\n.site-hero[data-hero-variant="slider"]',
  );
  assert.ok(
    onScrimPair.includes("--site-hero-on-scrim: #f8fafc"),
    "photographic heroes must define the light on-scrim ink",
  );

  for (const role of ["headline", "subheadline"]) {
    const body = ruleBody(
      `.site-hero[data-hero-variant="image"] .site-hero__${role},\n` +
        `.site-hero[data-hero-variant="slider"] .site-hero__${role}`,
    );
    assert.ok(
      body.includes("var(--site-hero-on-scrim"),
      `the ${role} over a photo must use the on-scrim ink`,
    );
    // Polarity: a dark shadow only helps LIGHT text. The pre-fix bug was a
    // dark shadow under dark text.
    assert.ok(
      /text-shadow:[^;]*rgba\(0,\s*0,\s*0/.test(body),
      `the ${role} over a photo must keep a dark text-shadow under its light ink`,
    );
  }

  // ...and the image-less hero must NOT carry that dark shadow, because
  // there its ink is dark too.
  for (const role of ["headline", "subheadline"]) {
    assert.ok(
      !ruleBody(`.site-hero__${role}`).includes("text-shadow"),
      `the classic (image-less) .site-hero__${role} must not carry a dark text-shadow under dark ink`,
    );
  }
});

test("hero copy clears the contrast floor over the worst-case photo", () => {
  // The worst photo a tenant could upload, for a DARK scrim, is a pure-WHITE
  // one. The thinnest part of the wash the copy block actually reaches is
  // the radial's 0.50 stop (the copy is capped at 52rem inside a hero whose
  // radial runs to 92% x 74%), stacked over the linear's 0.30 mid stop.
  // Same ink, so the effective alpha is 1 - (1 - 0.50)(1 - 0.30).
  //
  // Live cross-check on qa-wave7-starter at 390px, sampling the BRIGHTEST
  // composited pixel under each text box: 6.38:1 headline / 5.88:1
  // subheadline over a synthetic white photo, 9.46 / 9.33 over a very dark
  // photo, 10.93 / 8.27 over a busy bright one. The modelled floors below
  // sit just under the measured white-photo case on purpose.
  const radialCopyEdge = 0.5;
  const linearMid = 0.3;
  const effectiveAlpha = 1 - (1 - radialCopyEdge) * (1 - linearMid);

  // Keep this in step with globals.css: if someone lightens the scrim, the
  // ratios below drop and this test is what catches it.
  const scrimBody = ruleBody(".site-hero__scrim");
  assert.ok(
    scrimBody.includes(`rgba(9, 9, 11, ${radialCopyEdge})`),
    "the radial 58% stop must stay at 0.50 (or this floor must be recomputed)",
  );
  assert.ok(
    scrimBody.includes(`rgba(9, 9, 11, ${linearMid})`),
    "the linear mid stop must stay at 0.30 (or this floor must be recomputed)",
  );

  const backdrop = over(SCRIM_INK, effectiveAlpha, WHITE);

  const headlineRatio = contrastRatio(ON_SCRIM, backdrop);
  const bodyInk = over(ON_SCRIM, ON_SCRIM_MUTED_ALPHA, backdrop);
  const bodyRatio = contrastRatio(bodyInk, backdrop);

  // AA-large-and-then-some for the headline, AA body-text for the
  // subheadline, against the brightest photo anyone could possibly upload.
  assert.ok(
    headlineRatio >= 5.5,
    `hero headline over a white photo must clear 5.5:1, got ${headlineRatio.toFixed(2)}:1`,
  );
  assert.ok(
    bodyRatio >= 4.5,
    `hero subheadline over a white photo must clear 4.5:1, got ${bodyRatio.toFixed(2)}:1`,
  );
});

test("the redundant gradient-scrim flavor is suppressed on photographic heroes", () => {
  // Not cosmetic: the flavor overlay washes toward the tenant CANVAS colour,
  // so on a light tenant it would paint white over the photo and then the
  // scrim would darken that back down, muddying the photograph for nothing.
  assert.ok(
    /showFlavorOverlay =\s*\n?\s*effectiveOverlay !== "none" &&\s*\n?\s*!\(hasPhotoBackdrop && effectiveOverlay === "gradient-scrim"\)/.test(
      componentSrc,
    ),
    "gradient-scrim must be suppressed when the legibility scrim already covers the photo",
  );
  assert.ok(
    componentSrc.includes("{showFlavorOverlay ? ("),
    "the flavor overlay must render through showFlavorOverlay",
  );
});
