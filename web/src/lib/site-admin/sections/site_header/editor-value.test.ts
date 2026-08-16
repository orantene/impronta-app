/**
 * editor-value.test.ts — F5 regression guard for the shell section editors
 * (site_header + site_footer). Pure: node:test + node:assert, no React.
 *
 * THE BUG THIS PINS
 * -----------------
 * Both editors built their working `value` by LISTING fields off `initial`.
 * That object is the base of every `onChange` payload the editor emits
 * (`onChange({ ...value, ...next })`), so any schema field missing from the
 * list was erased from the section's persisted props the moment the operator
 * touched a single control. Four real fields were being dropped:
 * `regions` / `scrollTone` / `scrollThresholdPx` / `nodePresentation` (header)
 * and `nodePresentation` (footer).
 *
 * WHY THE TEST IS SCHEMA-DRIVEN
 * -----------------------------
 * A test that hard-codes today's four fields would go stale the next time
 * someone adds a schema field — which is exactly the failure mode. Instead we
 * enumerate the ZOD SCHEMA's own keys, stamp a unique sentinel on every one,
 * and assert the defaults layer round-trips all of them. A new schema field is
 * therefore covered automatically, and re-introducing a whitelist fails here.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { siteHeaderSchemaV1 } from "./schema";
import { withSiteHeaderEditorDefaults } from "./editor-value";
import { siteFooterSchemaV1 } from "../site_footer/schema";
import { withSiteFooterEditorDefaults } from "../site_footer/editor-value";

/** Every top-level key the zod object schema declares. */
function schemaKeys(schema: { shape: Record<string, unknown> }): string[] {
  return Object.keys(schema.shape);
}

/**
 * Build an `initial` carrying a UNIQUE sentinel under every schema key, so a
 * dropped key is distinguishable from a key that merely got defaulted.
 */
function sentinelValue(keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) out[key] = { __sentinel: key };
  return out;
}

function assertRoundTrips(
  label: string,
  keys: string[],
  applyDefaults: (initial: Record<string, unknown>) => Record<string, unknown>,
) {
  const initial = sentinelValue(keys);
  const value = applyDefaults(initial);

  // 1. The defaults layer preserves every schema field verbatim.
  for (const key of keys) {
    assert.deepEqual(
      value[key],
      { __sentinel: key },
      `${label}: defaults layer dropped or overwrote "${key}" — it must spread ` +
        `\`initial\` rather than whitelist fields (see editor-value.ts)`,
    );
  }

  // 2. Simulate the editor's actual onChange merge: the ZodSchemaForm reports a
  //    single changed field, and the editor emits `{ ...value, ...next }`. Every
  //    OTHER field must survive that round-trip.
  const changedKey = keys[0];
  const emitted = { ...value, ...{ [changedKey]: "edited" } };
  for (const key of keys) {
    if (key === changedKey) continue;
    assert.deepEqual(
      emitted[key],
      { __sentinel: key },
      `${label}: editing "${changedKey}" lost "${key}" from the emitted props`,
    );
  }
  assert.equal(emitted[changedKey], "edited", `${label}: edit did not apply`);
}

test("[F5] site_header editor preserves EVERY schema field across an edit", () => {
  const keys = schemaKeys(
    siteHeaderSchemaV1 as unknown as { shape: Record<string, unknown> },
  );
  assert.ok(keys.length > 0, "site_header schema exposed no keys");
  // The four fields the shipped whitelist was dropping — asserted by name too,
  // so the regression is legible in the failure output, not just in the loop.
  for (const dropped of [
    "regions",
    "scrollTone",
    "scrollThresholdPx",
    "nodePresentation",
  ]) {
    assert.ok(
      keys.includes(dropped),
      `site_header schema no longer declares "${dropped}" — update this test`,
    );
  }
  assertRoundTrips("site_header", keys, (initial) =>
    withSiteHeaderEditorDefaults(
      initial as Parameters<typeof withSiteHeaderEditorDefaults>[0],
    ) as unknown as Record<string, unknown>,
  );
});

test("[F5] site_footer editor preserves EVERY schema field across an edit", () => {
  const keys = schemaKeys(
    siteFooterSchemaV1 as unknown as { shape: Record<string, unknown> },
  );
  assert.ok(keys.length > 0, "site_footer schema exposed no keys");
  assert.ok(
    keys.includes("nodePresentation"),
    'site_footer schema no longer declares "nodePresentation" — update this test',
  );
  assertRoundTrips("site_footer", keys, (initial) =>
    withSiteFooterEditorDefaults(
      initial as Parameters<typeof withSiteFooterEditorDefaults>[0],
    ) as unknown as Record<string, unknown>,
  );
});
