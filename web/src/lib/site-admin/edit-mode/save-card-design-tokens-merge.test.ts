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

// The working map the studio submits: every key in CARD_DESIGN_TOKEN_KEYS
// (the registry-gate assertion below exercises the full persisted set).
const STUDIO_PATCH: Record<string, string> = {
  "template.directory-card-family": "editorial-noir",
  "card.surface": "#0f0f0f",
  "card.name-color": "#f4f1ea",
  "card.muted": "",
  "card.price-color": "",
  "directory.card.show-standing": "compact",
  "directory.card.standing-style": "both",
  "profile.reviews-visibility": "visible",
  "directory.card.show-starting-from-price": "off",
  "directory.card.show-quick-view": "on",
  "directory.card.profile-popup": "on",
  "directory.card.show-favorite": "on",
  "directory.card.show-inquiry": "on",
  "favorite.icon": "heart",
  "directory.card.style": "portrait",
  "directory.card.aspect": "4:5",
  "directory.card.hover": "reveal_traits",
  "directory.card.density": "comfortable",
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

// ── Module-cycle guard for card-design-token-keys.ts ─────────────────────────
//
// 2026-08-03 sev-1: card-design-token-keys.ts imported CARD_FAMILY_TOKEN_KEY /
// CARD_COLOR_KNOBS from CardDesignStudio-3 while CardDesignStudio-3 re-exported
// CARD_DESIGN_TOKEN_KEYS from it. In the production chunk graph that cycle hit
// a temporal-dead-zone ReferenceError at module evaluation and took down the
// whole admin shell (dev chunking, tsc, lint and `next build` were all green).
// Pin: the keys module stays import-free, and its knob keys stay in sync with
// the labeled knob array in CardDesignStudio-3.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CARD_COLOR_KNOB_KEYS,
  CARD_DESIGN_TOKEN_KEYS,
  CARD_FAMILY_TOKEN_KEY,
} from "../../../components/admin/shell/internal/page-modules/card-design-token-keys";

const KEYS_MODULE_PATH = join(
  process.cwd(),
  "src/components/admin/shell/internal/page-modules/card-design-token-keys.ts",
);

test("card-design-token-keys.ts is import-free (module-cycle guard)", () => {
  const source = readFileSync(KEYS_MODULE_PATH, "utf8");
  const importLines = source
    .split("\n")
    .filter((l) => /^\s*import[\s{]/.test(l) || /\brequire\s*\(/.test(l));
  assert.deepEqual(
    importLines,
    [],
    "card-design-token-keys.ts must not import anything — a CardDesignStudio-3 " +
      "import here recreates the TDZ cycle that crashed the prod admin shell",
  );
});

test("CARD_DESIGN_TOKEN_KEYS starts with the family key + color knob keys", () => {
  assert.deepEqual(
    CARD_DESIGN_TOKEN_KEYS.slice(0, 1 + CARD_COLOR_KNOB_KEYS.length),
    [CARD_FAMILY_TOKEN_KEY, ...CARD_COLOR_KNOB_KEYS],
  );
});

test("CARD_COLOR_KNOB_KEYS matches the labeled knob array in CardDesignStudio-3 (real parity, not a tautology)", () => {
  // CardDesignStudio-3.tsx is a client component (lucide/react imports), so
  // extract the knob keys statically instead of importing the module.
  const source = readFileSync(
    join(
      process.cwd(),
      "src/components/admin/shell/internal/page-modules/CardDesignStudio-3.tsx",
    ),
    "utf8",
  );
  const block = source.match(
    /CARD_COLOR_KNOBS[\s\S]*?=\s*\[([\s\S]*?)\n\];/,
  );
  assert.ok(block, "CARD_COLOR_KNOBS array not found in CardDesignStudio-3");
  const knobKeys = [...block![1].matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    knobKeys,
    [...CARD_COLOR_KNOB_KEYS],
    "the studio's labeled color knobs drifted from CARD_COLOR_KNOB_KEYS — update card-design-token-keys.ts in the same change",
  );
});

test("STUDIO_PATCH covers every persisted studio key (registry gate exercises the full set)", () => {
  assert.deepEqual(
    Object.keys(STUDIO_PATCH).sort(),
    [...CARD_DESIGN_TOKEN_KEYS].sort(),
  );
});
