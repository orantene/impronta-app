import assert from "node:assert/strict";
import { test } from "node:test";

import { validateThemePatch } from "../index";
import { getCardKit } from "../presets/card-kits";

/**
 * Contract guard for `applyCardKitFromEditAction` (design-actions.ts).
 *
 * The action can't be invoked in a unit context (it needs request-scoped
 * `requireStaff()` / `requireTenantScope()`), so we pin the two pure
 * decisions it makes against the same primitives it uses:
 *
 *   1. An UNKNOWN slug short-circuits — `getCardKit` returns null, which the
 *      action turns into a NOT_FOUND error WITHOUT touching the draft.
 *   2. A known kit MERGES onto the operator's current draft (kit wins on its
 *      own keys; every orthogonal token is preserved), and the merged map is
 *      still a valid theme patch — so the downstream `saveDesignDraft` CAS +
 *      registry gate accept it.
 */

test("applyCardKit: unknown slug resolves to null (action returns NOT_FOUND, no write)", () => {
  assert.equal(getCardKit("not-a-real-kit"), null);
  assert.equal(getCardKit(""), null);
});

test("applyCardKit: a known kit merges onto the draft — kit wins, orthogonal tokens survive", () => {
  const kit = getCardKit("editorial-noir");
  assert.ok(kit, "editorial-noir must resolve");

  // An operator draft that already customised an unrelated theme token plus an
  // older card surface value the kit will overwrite.
  const currentDraft: Record<string, string> = {
    "color.accent": "#123456",
    "card.surface": "#ffffff",
  };

  // Same merge the action performs: { ...draft, ...kit.tokens }.
  const merged = { ...currentDraft, ...kit.tokens };

  // Kit wins on its own keys.
  assert.equal(merged["card.surface"], kit.tokens["card.surface"]);
  assert.equal(
    merged["template.directory-card-family"],
    kit.tokens["template.directory-card-family"],
  );
  // Orthogonal operator token is preserved.
  assert.equal(merged["color.accent"], "#123456");

  // The merged map must still pass the registry gate the save path enforces.
  const gate = validateThemePatch(merged);
  assert.ok(
    gate.ok,
    `merged kit draft must be a valid theme patch: ${JSON.stringify(
      gate.ok ? {} : { rejected: gate.rejected },
    )}`,
  );
});
