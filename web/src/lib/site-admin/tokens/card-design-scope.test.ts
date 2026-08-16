/**
 * Scoped-publish semantics.
 *
 * `publishDesign` composes the live map as
 *   scoped   → { ...liveRegistry, ...promotedSlice, ...legacy }
 *   unscoped → {                  ...wholeDraft,    ...legacy }
 *
 * These pin that composition. The whole point of the scope is that a card
 * publish CANNOT move a token belonging to another surface — the 2026-08-15
 * incident, where publishing a card colour carried a stale site preset live
 * and repainted a storefront white.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { CARD_DESIGN_SCOPE, CARD_DESIGN_TOKEN_KEYS } from "./card-design-scope";
import { splitLegacyThemeKeys } from "./legacy-passthrough";

/** Mirror of the server op's live-map composition. */
function composeNextTheme(
  live: Record<string, string>,
  draft: Record<string, string>,
  scopeKeys?: ReadonlySet<string>,
): Record<string, string> {
  const draftSplit = splitLegacyThemeKeys(draft);
  const promotable = scopeKeys
    ? Object.fromEntries(
        Object.entries(draftSplit.registryCandidate).filter(([k]) => scopeKeys.has(k)),
      )
    : draftSplit.registryCandidate;
  const legacy = {
    ...splitLegacyThemeKeys(live).legacy,
    ...draftSplit.legacy,
  };
  const liveBase = scopeKeys ? splitLegacyThemeKeys(live).registryCandidate : {};
  return { ...liveBase, ...promotable, ...legacy } as Record<string, string>;
}

test("scoped publish promotes card tokens and leaves other live tokens ALONE", () => {
  const live = {
    "card.surface": "#0f0f0f",
    "background.mode": "editorial-noir",
    "typography.heading-preset": "cinzel-editorial",
    logo_url: "https://x/logo.png",
  };
  // The draft carries a card edit AND someone else's pending theme rewrite.
  const draft = {
    "card.surface": "#000000",
    "background.mode": "plain",
    "typography.heading-preset": "sans",
    logo_url: "https://x/logo.png",
  };

  const next = composeNextTheme(live, draft, CARD_DESIGN_SCOPE);

  assert.equal(next["card.surface"], "#000000", "card token publishes");
  assert.equal(next["background.mode"], "editorial-noir", "theme token must NOT move");
  assert.equal(next["typography.heading-preset"], "cinzel-editorial", "font must NOT move");
  assert.equal(next.logo_url, "https://x/logo.png", "legacy key preserved");
});

test("the 2026-08-15 incident cannot recur through the card publish", () => {
  const noirLive = {
    "card.surface": "#0f0f0f",
    "background.mode": "editorial-noir",
    "color.ink": "#f4f4f5",
    "color.surface-raised": "#0f0f0f",
  };
  // A full "Studio Minimal" preset sitting unpublished in the shared draft.
  const draftWithStalePreset = {
    "card.surface": "#000000",
    "background.mode": "plain",
    "color.ink": "#0f0f0f",
    "color.surface-raised": "#ffffff",
  };

  const scoped = composeNextTheme(noirLive, draftWithStalePreset, CARD_DESIGN_SCOPE);
  assert.equal(scoped["color.surface-raised"], "#0f0f0f", "site stays dark");
  assert.equal(scoped["background.mode"], "editorial-noir");
  assert.equal(scoped["card.surface"], "#000000", "the intended edit still ships");

  // Unscoped (the ThemeDrawer's own publish) still promotes everything —
  // that surface owns the whole theme and submits a complete map.
  const unscoped = composeNextTheme(noirLive, draftWithStalePreset, undefined);
  assert.equal(unscoped["color.surface-raised"], "#ffffff");
});

test("scope contains every card token the studio edits, and no theme tokens", () => {
  for (const key of CARD_DESIGN_TOKEN_KEYS) {
    assert.ok(CARD_DESIGN_SCOPE.has(key), `${key} missing from the scope set`);
  }
  for (const foreign of [
    "background.mode",
    "typography.heading-preset",
    "color.ink",
    "shell.header-variant",
    "density.container-width",
  ]) {
    assert.ok(!CARD_DESIGN_SCOPE.has(foreign), `${foreign} must not be card-scoped`);
  }
});

test("a token absent from the draft is not erased from live by a scoped publish", () => {
  const live = { "card.surface": "#0f0f0f", "directory.card.style": "editorial" };
  const draft = { "card.surface": "#000000" }; // draft never seeded card.style
  const next = composeNextTheme(live, draft, CARD_DESIGN_SCOPE);
  assert.equal(next["directory.card.style"], "editorial");
});
