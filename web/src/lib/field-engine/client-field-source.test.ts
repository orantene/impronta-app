// client-field-source.test.ts
// Unit tests for the P1 field-engine unification flag parser + the client
// selector / dev parity assertion. Pure functions only (no DB).
// Run: npx tsx --test src/lib/field-engine/client-field-source.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFieldEngineClientSourceFlags,
  DEFAULT_FIELD_ENGINE_CLIENT_SOURCE_FLAGS,
  type ClientFieldSourcePayload,
} from "@/lib/field-engine/client-field-source-types";
import {
  resolveDynamicFieldsForParent,
  surfaceUsesDb,
} from "@/lib/field-engine/client-field-source-select";
import type { RegField } from "@/components/admin/shell/internal/state/types";

// ── Flag parser ──────────────────────────────────────────────────────────────

test("parser: unset/empty → all static (the safe default)", () => {
  assert.deepEqual(
    parseFieldEngineClientSourceFlags(undefined),
    DEFAULT_FIELD_ENGINE_CLIENT_SOURCE_FLAGS,
  );
  assert.deepEqual(
    parseFieldEngineClientSourceFlags(""),
    DEFAULT_FIELD_ENGINE_CLIENT_SOURCE_FLAGS,
  );
  assert.deepEqual(parseFieldEngineClientSourceFlags("   "), {
    wizard: "static",
    drawer: "static",
    validation: "static",
  });
});

test("parser: 'db' flips every surface; 'static' is explicit all-static", () => {
  assert.deepEqual(parseFieldEngineClientSourceFlags("db"), {
    wizard: "db",
    drawer: "db",
    validation: "db",
  });
  assert.deepEqual(parseFieldEngineClientSourceFlags("STATIC"), {
    wizard: "static",
    drawer: "static",
    validation: "static",
  });
});

test("parser: per-surface tokens flip only the named surface", () => {
  assert.deepEqual(parseFieldEngineClientSourceFlags("wizard:db"), {
    wizard: "db",
    drawer: "static",
    validation: "static",
  });
  assert.deepEqual(
    parseFieldEngineClientSourceFlags("wizard:db,drawer:db,validation:static"),
    { wizard: "db", drawer: "db", validation: "static" },
  );
});

test("parser: unknown surfaces/sources are ignored (fail safe to static)", () => {
  assert.deepEqual(parseFieldEngineClientSourceFlags("bogus:db,wizard:weird"), {
    wizard: "static",
    drawer: "static",
    validation: "static",
  });
});

// ── Selector ─────────────────────────────────────────────────────────────────

const staticFields: RegField[] = [
  { id: "height", label: "Height", kind: "text" },
  { id: "bust", label: "Bust", kind: "text", optional: true },
];

function payload(
  flags: Partial<ClientFieldSourcePayload["flags"]>,
  byParent: ClientFieldSourcePayload["dynamicFieldsByParent"] = {},
): ClientFieldSourcePayload {
  return {
    flags: { wizard: "static", drawer: "static", validation: "static", ...flags },
    dynamicFieldsByParent: byParent,
    generatedAt: "2026-06-10T00:00:00.000Z",
  };
}

test("selector: null payload → null (use static)", () => {
  assert.equal(
    resolveDynamicFieldsForParent({
      payload: null,
      surface: "wizard",
      parentSlug: "models",
      staticFields,
    }),
    null,
  );
});

test("selector: surface static → null even when DB has fields", () => {
  const p = payload(
    { wizard: "static" },
    { models: [{ id: "height_cm", fieldKey: "physical.height_cm", label: "Height (cm)", kind: "number", displayOrder: 1 }] },
  );
  assert.equal(
    resolveDynamicFieldsForParent({ payload: p, surface: "wizard", parentSlug: "models", staticFields }),
    null,
  );
});

test("selector: surface db with DB fields → returns mapped RegFields", () => {
  const p = payload(
    { wizard: "db" },
    {
      models: [
        { id: "height_cm", fieldKey: "physical.height_cm", label: "Height (cm)", kind: "number", displayOrder: 1 },
        { id: "bust_cm", fieldKey: "physical.bust_cm", label: "Bust", kind: "number", optional: true, displayOrder: 2 },
      ],
    },
  );
  const out = resolveDynamicFieldsForParent({ payload: p, surface: "wizard", parentSlug: "models", staticFields });
  assert.ok(out);
  assert.equal(out!.length, 2);
  assert.equal(out![0]!.id, "height_cm");
  assert.equal(out![0]!.label, "Height (cm)");
  assert.equal(out![0]!.kind, "number");
});

test("selector: surface db but NO DB fields for parent → null (static fallback)", () => {
  const p = payload({ wizard: "db" }, { hosts: [{ id: "vibe", fieldKey: "host.vibe", label: "Vibe", kind: "select", displayOrder: 1 }] });
  assert.equal(
    resolveDynamicFieldsForParent({ payload: p, surface: "wizard", parentSlug: "models", staticFields }),
    null,
  );
});

test("surfaceUsesDb reflects per-surface flags", () => {
  const p = payload({ wizard: "db", drawer: "static" });
  assert.equal(surfaceUsesDb(p, "wizard"), true);
  assert.equal(surfaceUsesDb(p, "drawer"), false);
  assert.equal(surfaceUsesDb(null, "wizard"), false);
});
