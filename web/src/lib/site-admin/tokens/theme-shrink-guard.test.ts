/**
 * Threshold unit coverage for the theme shrink guard.
 *
 * The integration suite (`server/theme-publish-shrink-integration.test.ts`)
 * proves the guard is WIRED into the real `publishDesign`. This file pins the
 * threshold arithmetic itself, including the false-positive boundary — the
 * property that decides whether the guard is safe to leave switched on.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  CATASTROPHIC_TOKEN_FLOOR,
  ESTABLISHED_LIVE_TOKENS,
  checkThemePublishShrink,
  countThemeTokens,
  shrinkFloorFor,
} from "./theme-shrink-guard";

/** n synthetic keys — the guard counts keys, it does not inspect them. */
const keys = (n: number, prefix = "t") =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}.${i}`, "v"]));

describe("countThemeTokens", () => {
  test("excludes the legacy passthrough keys from both sides of the comparison", () => {
    assert.equal(
      countThemeTokens({
        "color.primary": "#000",
        logo_url: "x",
        favicon_url: "y",
        watermark_preset: "z",
      }),
      1,
      "adding or clearing a logo must never move the token count",
    );
  });

  test("null / undefined / empty all count as zero", () => {
    assert.equal(countThemeTokens(null), 0);
    assert.equal(countThemeTokens(undefined), 0);
    assert.equal(countThemeTokens({}), 0);
  });
});

describe("shrinkFloorFor", () => {
  test("is the greater of the absolute floor and 25% of live", () => {
    assert.equal(shrinkFloorFor(0), CATASTROPHIC_TOKEN_FLOOR);
    assert.equal(shrinkFloorFor(20), CATASTROPHIC_TOKEN_FLOOR, "25% of 20 = 5 < 10");
    assert.equal(shrinkFloorFor(55), 14, "ceil(55 * 0.25)");
    assert.equal(shrinkFloorFor(200), 50);
  });
});

describe("the guard engages only on an ESTABLISHED live theme", () => {
  test(`live below ${ESTABLISHED_LIVE_TOKENS} tokens is never blocked, even going to zero`, () => {
    for (let live = 0; live < ESTABLISHED_LIVE_TOKENS; live += 1) {
      const v = checkThemePublishShrink({ live: keys(live), next: {} });
      assert.equal(v.ok, true, `live=${live} must pass — new/small tenants are exempt`);
    }
  });

  test("the very first publish of a workspace (live {}) always passes", () => {
    assert.equal(checkThemePublishShrink({ live: {}, next: keys(3) }).ok, true);
    assert.equal(checkThemePublishShrink({ live: {}, next: {} }).ok, true);
  });
});

describe("the guard blocks only a CATASTROPHIC reduction", () => {
  test("the 2026-08-16 shape (55 → 1) is blocked", () => {
    const v = checkThemePublishShrink({ live: keys(55), next: keys(1) });
    assert.equal(v.ok, false);
    assert.equal(v.liveTokenCount, 55);
    assert.equal(v.nextTokenCount, 1);
    assert.equal(v.requiredMinimum, 14);
    assert.match(v.message, /Publish blocked/);
    assert.match(v.message, /55 design tokens/);
    assert.match(v.message, /Nothing was changed/);
  });

  test("the boundary is exact — at the floor it passes, one below it blocks", () => {
    assert.equal(checkThemePublishShrink({ live: keys(55), next: keys(14) }).ok, true);
    assert.equal(checkThemePublishShrink({ live: keys(55), next: keys(13) }).ok, false);
  });

  test("an ordinary edit (same size, same-ish size, or growth) always passes", () => {
    assert.equal(checkThemePublishShrink({ live: keys(55), next: keys(55) }).ok, true);
    assert.equal(checkThemePublishShrink({ live: keys(55), next: keys(54) }).ok, true);
    assert.equal(checkThemePublishShrink({ live: keys(55), next: keys(79) }).ok, true);
    assert.equal(
      checkThemePublishShrink({ live: keys(55), next: keys(28) }).ok,
      true,
      "even halving the theme is allowed — only a wipe is refused",
    );
  });
});

describe("Spanish copy ships with the block", () => {
  test("a blocked verdict carries both locales and the same numbers", () => {
    const v = checkThemePublishShrink({ live: keys(58), next: keys(2) });
    assert.equal(v.ok, false);
    assert.match(v.messageEs, /Publicación bloqueada/);
    assert.match(v.messageEs, /58 tokens de diseño/);
    assert.match(v.messageEs, /No se cambió nada/);
  });

  test("a passing verdict carries no copy at all", () => {
    const v = checkThemePublishShrink({ live: keys(55), next: keys(55) });
    assert.equal(v.message, "");
    assert.equal(v.messageEs, "");
  });
});

describe("allowReduction escape hatch", () => {
  test("an explicit teardown is permitted", () => {
    assert.equal(
      checkThemePublishShrink({ live: keys(55), next: {}, allowReduction: true }).ok,
      true,
    );
  });

  test("it is opt-in — the default never infers intent from a small map", () => {
    assert.equal(checkThemePublishShrink({ live: keys(55), next: {} }).ok, false);
  });
});
