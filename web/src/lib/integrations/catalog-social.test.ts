import assert from "node:assert/strict";
import test from "node:test";

import { getIntegrationDef, listIntegrationDefsByCategory } from "./catalog";

test("instagram and tiktok are in the catalog as OAuth social integrations", () => {
  for (const key of ["instagram", "tiktok"]) {
    const def = getIntegrationDef(key);
    assert.ok(def, key);
    assert.equal(def.connection, "oauth", key);
    assert.equal(def.category, "social", key);
    // Not inheritable: a tenant's social account is never a platform default.
    assert.equal(def.inheritable, false, key);
  }
});

test("the social category still includes youtube (no entry displaced)", () => {
  const keys = listIntegrationDefsByCategory("social").map((d) => d.key);
  for (const expected of ["youtube", "instagram", "tiktok"]) {
    assert.ok(keys.includes(expected), `missing ${expected}`);
  }
});

test("instagram instructions warn about personal accounts BEFORE connecting", () => {
  // A personal account passes OAuth but returns no media, so the operator would
  // connect "successfully" and get a permanently empty feed. The card must say
  // so up front.
  const def = getIntegrationDef("instagram");
  assert.ok(def);
  assert.ok(
    def.instructions.some((line) => /business or creator/i.test(line)),
    "no Business/Creator warning in instructions",
  );
});

test("every social def carries i18n keys alongside English copy", () => {
  for (const key of ["instagram", "tiktok"]) {
    const def = getIntegrationDef(key);
    assert.ok(def);
    assert.ok(def.labelKey.includes(key), `${key} labelKey`);
    assert.equal(
      def.instructionKeys?.length,
      def.instructions.length,
      `${key} instructionKeys must be index-aligned with instructions`,
    );
  }
});
