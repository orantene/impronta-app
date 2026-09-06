import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { contrastRatio, foregroundForPrimary } from "@/lib/site-admin/tokens/contrast-pair";

/**
 * A primary button's label must DERIVE its colour, not guess it.
 *
 * THE DEFECT
 * ──────────
 * The renderer's stylesheet painted a tone-primary button's label with
 * `--token-color-surface-raised` — the tenant's raised SURFACE colour, which
 * has nothing to do with the button's background. For a tenant whose primary is
 * pale (amber #ffc107 with a white surface-raised) that is white on amber:
 * 1.39:1, an unreadable label.
 *
 * Same shape as the shadcn-button defect fixed by projecting
 * `--token-color-primary-on` from `foregroundForPrimary()`. This makes the
 * builder's own button read the same token, keeping the old value as the
 * FALLBACK so nothing moves for a tenant without the projection.
 *
 * NOT THE DISABLED RULE, and that is deliberate. The disabled-primary rule
 * paints a FIXED `rgba(18,18,18,0.35)` background, not the tenant's primary, so
 * its white label is correct and derivation would be wrong there — the pairing
 * token describes the tenant's primary, and that rule does not use it.
 */

const RENDER_SRC = readFileSync(
  join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"),
  "utf8",
);

test("the tone-primary button reads the pairing token before the surface guess", () => {
  const rule = RENDER_SRC.match(
    /\.site-builder-node--button\[data-builder-button-tone="primary"\]\{[^}]*\}/,
  );
  assert.ok(rule, "the tone-primary rule is gone or was renamed");
  assert.match(
    rule[0],
    /color:var\(--token-color-primary-on,/,
    "the label must derive from the primary's pair, not from the raised surface",
  );
});

test("the hover / focus / active primary rule derives too", () => {
  // A button that is readable at rest and unreadable on hover is worse than one
  // that is wrong consistently — the operator sees it working.
  const rule = RENDER_SRC.match(
    /data-builder-button-active-tone="primary"\]:active\{[^}]*\}/,
  );
  assert.ok(rule, "the hover/focus/active primary rule is gone or was renamed");
  assert.match(
    rule[0],
    /color:var\(--token-color-primary-on,/,
    "the interactive states must derive the same way as the resting state",
  );
});

test("the old value survives as the FALLBACK, so nothing moves without the projection", () => {
  const derived = RENDER_SRC.match(
    /color:var\(--token-color-primary-on,var\(--token-color-surface-raised,#fff\)\)/g,
  );
  assert.equal(
    derived?.length,
    2,
    "both rules must keep `--token-color-surface-raised` as the inner fallback; " +
      "dropping it would change what a tenant without the projection sees",
  );
});

test("the guess this replaces is genuinely unreadable on a pale primary", () => {
  // The measurement behind the change, pinned so the rationale cannot rot.
  const amber = "#ffc107";
  const whiteSurface = "#ffffff";
  const guessed = contrastRatio(amber, whiteSurface)!;
  const derivedInk = foregroundForPrimary(amber)!;
  const fixed = contrastRatio(amber, derivedInk)!;

  assert.ok(guessed < 2, `the surface guess should be unreadable, got ${guessed.toFixed(2)}`);
  assert.ok(fixed >= 4.5, `the derived pair must clear AA, got ${fixed.toFixed(2)}`);
});
