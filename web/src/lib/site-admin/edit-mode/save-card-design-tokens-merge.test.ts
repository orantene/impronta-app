import assert from "node:assert/strict";
import { test } from "node:test";

import { validateThemePatch } from "../index";

/**
 * Contract guard for `saveCardDesignTokensFromEditAction` (design-actions.ts).
 *
 * The action can't be invoked in a unit context (it needs request-scoped
 * `requireStaff()` / `requireTenantScope()`), so we pin the pure decision it
 * makes against the same primitives it uses — the exact bug this action fixes:
 * the Card Design studio holds ONLY the card token keys, and sending that
 * subset through the full-replacement `saveDesignDraftFromEditAction` stripped
 * every orthogonal token (page canvas, fonts, accent, profile layout) from
 * `theme_json_draft`; the next Publish then reverted the live theme to
 * registry defaults.
 */

// The working map the studio submits: card-family keys only (mirrors
// CARD_DESIGN_TOKEN_KEYS in CardDesignStudio-3.tsx).
const STUDIO_PATCH: Record<string, string> = {
  "template.directory-card-family": "editorial-noir",
  "card.surface": "#0f0f0f",
  "card.name-color": "#f4f1ea",
  "card.muted": "",
  "card.price-color": "",
  "directory.card.show-standing": "compact",
  "directory.card.standing-style": "both",
  "directory.card.show-starting-from-price": "off",
  "directory.card.show-quick-view": "on",
  "directory.card.profile-popup": "on",
};

// A tenant draft that carries non-card theme tokens (the ones the old
// replacement path destroyed) plus an older card value the patch overwrites.
const TENANT_DRAFT: Record<string, string> = {
  "color.accent": "#d4af37",
  "typography.heading-font-family": "Cormorant Garamond",
  "template.profile-layout-family": "noir",
  "card.surface": "#ffffff",
};

test("card-design save: the patch merges onto the draft — patch wins, orthogonal tokens survive", () => {
  // Same merge the action performs: { ...draft, ...patch }.
  const merged = { ...TENANT_DRAFT, ...STUDIO_PATCH };

  // Patch wins on its own keys.
  assert.equal(merged["card.surface"], "#0f0f0f");
  assert.equal(merged["template.directory-card-family"], "editorial-noir");

  // The regression: every non-card token must survive a studio save.
  assert.equal(merged["color.accent"], "#d4af37");
  assert.equal(merged["typography.heading-font-family"], "Cormorant Garamond");
  assert.equal(merged["template.profile-layout-family"], "noir");
});

test("card-design save: empty-string knob values clear without dropping the key set", () => {
  const merged = { ...TENANT_DRAFT, ...STUDIO_PATCH };

  // "" is an explicit clear-to-theme-default; the key stays present so the
  // registry gate sees the operator's intent, and hex-or-empty accepts it.
  assert.equal(merged["card.muted"], "");
  assert.equal(merged["card.price-color"], "");
});

test("card-design save: the merged map passes the registry gate the save path enforces", () => {
  const merged = { ...TENANT_DRAFT, ...STUDIO_PATCH };
  const gate = validateThemePatch(merged);
  assert.ok(
    gate.ok,
    `merged studio draft must be a valid theme patch: ${JSON.stringify(
      gate.ok ? {} : { rejected: gate.rejected },
    )}`,
  );
});
