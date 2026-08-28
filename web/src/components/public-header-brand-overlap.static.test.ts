import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * public-header-brand-overlap.static.test.ts — the header-overlap invariant.
 *
 * THE DEFECT THIS PINS (owner live QA, 2026-08-27, `rivieramayawork`, 390px)
 * ────────────────────────────────────────────────────────────────────────────
 * Measured element rects inside the 390px bar, signed-in operator view:
 *
 *     open menu      16 →  52
 *     account/avatar 56 →  92
 *     search talent  96 → 132
 *     wordmark      102 → 252   ← painted OVER search AND over the heart
 *     shortlist     222 → 258
 *     inquiry       260 → 296
 *     admin         298 → 334
 *     sign out      338 → 374
 *
 * The document did NOT overflow (`scrollWidth === clientWidth === 390`), so
 * this was not the old sideways-scroll bug. The bar is
 * `grid-cols-[auto_minmax(0,1fr)_auto]` with `px-4` + `gap-2`, which puts the
 * centre track at 140 → 214, i.e. 74px wide, centred on 177 — exactly the
 * centre of the measured wordmark. The grid was doing its job; the leak was one
 * level down. The brand sat inside a plain wrapper `<span>` whose flex
 * `min-width` was still `auto`, i.e. the wordmark's full ~150px min-content
 * width. The wrapper refused to shrink into the 74px track and
 * `justify-content:center` spilled the overflow SYMMETRICALLY over the left and
 * right clusters.
 *
 * WHAT THIS TEST ACTUALLY GUARANTEES — READ THIS BEFORE TRUSTING IT
 * ────────────────────────────────────────────────────────────────────────────
 * This is a CSS + MARKUP CONTRACT test, not a geometric one. There is no layout
 * engine in this lane (jsdom reports every rect as 0×0), so nothing here
 * measures a pixel. What it does prove, and all it proves:
 *
 *   1. the bar still declares a grid whose SIDE tracks are content-sized and
 *      whose CENTRE track can reach zero — i.e. the layout reserves space for
 *      the icon clusters instead of assuming the brand owns the full width;
 *   2. every element on the path from that centre track down to the wordmark
 *      glyphs is allowed to shrink (`min-width:0`), so no link in the chain can
 *      re-pin the brand at its min-content width;
 *   3. the wordmark itself truncates (`overflow:hidden` + `text-overflow`
 *      + `white-space:nowrap`) rather than painting outside its box;
 *   4. the icon clusters are NOT given `min-width:0` — they must keep their
 *      automatic minimum size, because that is the floor the `auto` tracks are
 *      measured from and therefore what stops the clusters being squeezed into
 *      each other;
 *   5. the floor lives in a stylesheet keyed off data attributes, so a future
 *      utility-class edit on the JSX cannot silently undo it.
 *
 * Together (1)–(4) are the reason overlap cannot recur, but the ARITHMETIC that
 * turns them into "no two rects intersect at 390px and at 320px" is the
 * browser's, and only a browser can confirm it. A human still has to look at
 * the live bar once. What this test removes is the failure mode that produced
 * the bug: a shrinkable-looking chain with one `min-width:auto` link in it.
 */

const WEB_ROOT = path.resolve(__dirname, "../..");
const HEADER_TSX = path.join(WEB_ROOT, "src/components/public-header.tsx");
const TOKEN_CSS = path.join(WEB_ROOT, "src/app/token-presets.css");

const headerSource = fs.readFileSync(HEADER_TSX, "utf8");
const tokenCss = fs.readFileSync(TOKEN_CSS, "utf8");

/** Collapse whitespace so assertions survive reformatting. */
function flat(s: string): string {
  return s.replace(/\s+/g, " ");
}

const headerFlat = flat(headerSource);
const cssFlat = flat(tokenCss);

test("the bar grid reserves both icon clusters and lets the brand track reach zero", () => {
  // `auto` side tracks = content-sized, so the clusters set their own floor and
  // can never be compressed into one another. `minmax(0,1fr)` centre track =
  // the brand gets the leftover and nothing more. Changing either half is what
  // would reintroduce the class of bug, so both are pinned literally.
  assert.ok(
    headerFlat.includes("grid-cols-[auto_minmax(0,1fr)_auto]"),
    "public-header must keep the auto / minmax(0,1fr) / auto bar grid: the side "
      + "tracks are the icon clusters' floor and the centre track is the brand's cap",
  );
});

test("every brand mount point is a shrinkable slot", () => {
  // The wrapper spans are the elements that were pinned at min-content width.
  // Each `{brandLink}` mount must carry the marker AND `min-w-0`.
  const mounts = headerSource.match(/<span[^>]*>\s*\{brandLink\}/g) ?? [];
  assert.equal(
    mounts.length,
    4,
    "expected the four brand mount points (left col, centre desktop, centre "
      + `mobile, right col); found ${mounts.length}`,
  );
  for (const mount of mounts) {
    assert.ok(
      mount.includes("data-brand-slot-wrap"),
      `brand wrapper is missing data-brand-slot-wrap, so the stylesheet floor `
        + `does not reach it: ${flat(mount)}`,
    );
    assert.ok(
      /\bmin-w-0\b/.test(mount),
      `brand wrapper is missing min-w-0, which is exactly the min-width:auto `
        + `link that produced the 2026-08-27 overlap: ${flat(mount)}`,
    );
  }
});

test("the brand link and the wordmark are shrinkable and truncating", () => {
  assert.ok(
    headerFlat.includes("data-brand-slot"),
    "the brand <Link> must carry data-brand-slot",
  );
  assert.ok(
    /const brandLinkClass = \[[^\]]*min-w-0/.test(headerFlat),
    "the brand link class must keep min-w-0",
  );
  const label = /<span className="([^"]*)" data-brand-label>/.exec(headerFlat);
  assert.ok(label, "the wordmark <span> must carry data-brand-label");
  assert.ok(
    /\btruncate\b/.test(label![1]) && /\bmin-w-0\b/.test(label![1]),
    `the wordmark must be min-w-0 + truncate, got "${label![1]}"`,
  );
});

test("the icon clusters keep their automatic minimum size", () => {
  // Deliberately the opposite assertion to the brand's. If someone "fixes"
  // a future overflow by adding min-w-0 to a cluster column, the auto track
  // loses its floor and the shrink-0 buttons inside it start overlapping the
  // neighbouring track — the same defect, moved.
  const left = /<div className="flex items-center justify-start gap-1 sm:gap-2">/.exec(
    headerFlat,
  );
  assert.ok(left, "left icon cluster column not found (has the bar been restructured?)");
  const right = /<div className="flex items-center justify-end gap-0\.5 sm:gap-1">/.exec(
    headerFlat,
  );
  assert.ok(right, "right icon cluster column not found (has the bar been restructured?)");
  for (const col of [left![0], right![0]]) {
    assert.ok(
      !/\bmin-w-0\b/.test(col),
      "an icon cluster column must NOT be min-w-0 — it is the floor the auto "
        + `grid track is measured from: ${col}`,
    );
  }
});

test("token-presets.css carries the structural floor, not just the utility classes", () => {
  // The whole point of the stylesheet copy: a utility-class edit on the JSX
  // must not be able to silently undo the invariant.
  assert.ok(
    /\.public-header \[data-brand-slot-wrap\], \.public-header \[data-brand-slot\] \{ min-width: 0; max-width: 100%; \}/.test(
      cssFlat,
    ),
    "token-presets.css must keep the .public-header brand-slot min-width:0 floor",
  );
  const labelRule = /\.public-header \[data-brand-label\] \{([^}]*)\}/.exec(cssFlat);
  assert.ok(labelRule, "token-presets.css must keep the .public-header [data-brand-label] rule");
  const labelDecls = new Set(
    labelRule![1]
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean),
  );
  for (const decl of [
    "min-width: 0",
    "overflow: hidden",
    "text-overflow: ellipsis",
    "white-space: nowrap",
  ]) {
    assert.ok(
      labelDecls.has(decl),
      `[data-brand-label] must declare \`${decl}\` — without it the wordmark `
        + `paints outside its box instead of truncating`,
    );
  }
});

test("the shell header's row variants get the same phone-width floor", () => {
  // `.site-header` is a DIFFERENT surface (the snapshot site-shell's curated
  // bar) with the same shape of bug: `freeform` centres the brand between two
  // regions, and `editorial-split` sizes the brand from an `auto` grid track.
  // `minimal` / `editorial` stack the brand on its own row and cannot overlap,
  // so they are intentionally absent here.
  for (const selector of [
    '.site-header[data-variant="freeform"] .site-header__region[data-region="center"] .site-header__brand,',
    '.site-header[data-variant="editorial-split"] .site-header__brand,',
    '.site-header[data-variant="freeform"] .site-header__region[data-region="center"] .site-header__brand-label,',
    '.site-header[data-variant="editorial-split"] .site-header__brand-label,',
  ]) {
    assert.ok(
      cssFlat.includes(selector.replace(/,$/, "")),
      `token-presets.css must keep the phone-width brand floor for: ${selector}`,
    );
  }
});

test("no tenant-name length can defeat the floor", () => {
  // The invariant is expressed entirely in code + stylesheet; nothing about it
  // reads tenant data. Pinned as a statement of intent: the previous fix for
  // this class of bug lived in ONE tenant's shell data and protected nobody
  // else, which is why `rivieramayawork` shipped broken.
  assert.ok(
    !/data-brand-(slot|slot-wrap|label)[^\n]*tenant/i.test(headerSource),
    "the brand overlap floor must not be conditioned on tenant identity",
  );
});
