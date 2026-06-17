// client-field-source.test.ts
// Unit tests for the P1 field-engine unification flag parser + the client
// selector / dev parity assertion. Pure functions only (no DB).
// Run: npx tsx --test src/lib/field-engine/client-field-source.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFieldEngineClientSourceFlags,
  compareDynamicFieldDTOs,
  DEFAULT_FIELD_ENGINE_CLIENT_SOURCE_FLAGS,
  WIZARD_PARENT_ID_TO_DB_SLUG,
  wizardParentKeyToDbSlug,
  type ClientDynamicFieldDTO,
  type ClientFieldSourcePayload,
} from "@/lib/field-engine/client-field-source-types";
import {
  resolveDynamicFieldsForParent,
  surfaceUsesDb,
} from "@/lib/field-engine/client-field-source-select";
import type { RegField } from "@/components/admin/shell/internal/state/types";

// ── Flag parser ──────────────────────────────────────────────────────────────

test("parser: unset/empty → the default (wizard db, validation db, drawer static)", () => {
  assert.deepEqual(
    parseFieldEngineClientSourceFlags(undefined),
    DEFAULT_FIELD_ENGINE_CLIENT_SOURCE_FLAGS,
  );
  assert.deepEqual(
    parseFieldEngineClientSourceFlags(""),
    DEFAULT_FIELD_ENGINE_CLIENT_SOURCE_FLAGS,
  );
  assert.deepEqual(parseFieldEngineClientSourceFlags("   "), {
    wizard: "db",
    drawer: "static",
    validation: "db",
  });
});

test("parser: 'db' flips every surface; 'static' is the kill switch (all static)", () => {
  assert.deepEqual(parseFieldEngineClientSourceFlags("db"), {
    wizard: "db",
    drawer: "db",
    validation: "db",
  });
  // 'static' must revert the wizard too — the explicit kill switch.
  assert.deepEqual(parseFieldEngineClientSourceFlags("STATIC"), {
    wizard: "static",
    drawer: "static",
    validation: "static",
  });
});

test("parser: per-surface tokens layer over the default (others keep default)", () => {
  // Naming the drawer leaves the wizard + validation at their default (db).
  assert.deepEqual(parseFieldEngineClientSourceFlags("drawer:db"), {
    wizard: "db",
    drawer: "db",
    validation: "db",
  });
  // Opting the wizard out individually leaves validation at its default (db).
  assert.deepEqual(parseFieldEngineClientSourceFlags("wizard:static"), {
    wizard: "static",
    drawer: "static",
    validation: "db",
  });
  // The documented T1.4 kill switch: revert just the validation flip.
  assert.deepEqual(parseFieldEngineClientSourceFlags("validation:static"), {
    wizard: "db",
    drawer: "static",
    validation: "static",
  });
  assert.deepEqual(
    parseFieldEngineClientSourceFlags("wizard:db,drawer:db,validation:static"),
    { wizard: "db", drawer: "db", validation: "static" },
  );
});

test("parser: unknown surfaces/sources are ignored (keep default)", () => {
  // wizard:weird is invalid → wizard keeps its default (db); bogus is dropped.
  assert.deepEqual(parseFieldEngineClientSourceFlags("bogus:db,wizard:weird"), {
    wizard: "db",
    drawer: "static",
    validation: "db",
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

// ── Wizard parent-id ↔ DB slug reconciliation ────────────────────────────────

test("reconcile: renamed wizard ids map to their DB parent_category slug", () => {
  assert.equal(wizardParentKeyToDbSlug("hosts"), "hosts-promo");
  assert.equal(wizardParentKeyToDbSlug("music"), "music-djs");
  assert.equal(wizardParentKeyToDbSlug("creators"), "influencers-creators");
  assert.equal(wizardParentKeyToDbSlug("photo_video"), "photo-video-creative");
  assert.equal(wizardParentKeyToDbSlug("event_staff"), "event-staff");
  assert.equal(wizardParentKeyToDbSlug("security"), "security-protection");
  // exact matches map to themselves
  assert.equal(wizardParentKeyToDbSlug("models"), "models");
  assert.equal(wizardParentKeyToDbSlug("transportation"), "transportation");
});

test("reconcile: a DB slug passed straight through resolves to itself", () => {
  // Live-taxonomy path passes the DB slug as the parent id.
  assert.equal(wizardParentKeyToDbSlug("hosts-promo"), "hosts-promo");
  assert.equal(wizardParentKeyToDbSlug("wellness-beauty"), "wellness-beauty");
});

test("reconcile: 'services' (static catch-all) has no DB slug → null", () => {
  assert.equal(wizardParentKeyToDbSlug("services"), null);
  assert.ok(!("services" in WIZARD_PARENT_ID_TO_DB_SLUG));
});

test("selector: wizard id 'hosts' resolves DB fields keyed by 'hosts-promo'", () => {
  const p = payload(
    { wizard: "db" },
    { "hosts-promo": [{ id: "vibe", fieldKey: "host.vibe", label: "Vibe", kind: "select", displayOrder: 1 }] },
  );
  // Wizard passes the static id `hosts`; selector must find the `hosts-promo` set.
  const out = resolveDynamicFieldsForParent({ payload: p, surface: "wizard", parentSlug: "hosts", staticFields });
  assert.ok(out);
  assert.equal(out!.length, 1);
  assert.equal(out![0]!.id, "vibe");
});

test("selector: unmapped 'services' → static fallback even with a payload", () => {
  const p = payload(
    { wizard: "db" },
    { "home-technical-services": [{ id: "x", fieldKey: "svc.x", label: "X", kind: "text", displayOrder: 1 }] },
  );
  // services has no DB slug mapping → null (use static), never borrows another
  // parent's set.
  assert.equal(
    resolveDynamicFieldsForParent({ payload: p, surface: "wizard", parentSlug: "services", staticFields }),
    null,
  );
});

// ── Dynamic-field comparator (regression: localeCompare on undefined) ─────────
//
// `ClientDynamicFieldDTO.label` is TYPED `string` but a catalog row can carry a
// null/undefined label at runtime. The old inline sort
// `a.label.localeCompare(b.label)` threw `Cannot read properties of undefined
// (reading 'localeCompare')`, crashing `buildDynamicFieldsByParent` and dropping
// the talent dashboard's entire DB-backed field catalog every load.

// Model the runtime type-lie: a DTO whose label is actually undefined.
function dto(
  over: Partial<ClientDynamicFieldDTO> & { displayOrder: number },
): ClientDynamicFieldDTO {
  return {
    id: over.id ?? "f",
    fieldKey: over.fieldKey ?? "x.f",
    label: "L",
    kind: "text",
    ...over,
  } as ClientDynamicFieldDTO;
}

test("comparator: an undefined label does NOT throw (regression)", () => {
  const withLabel = dto({ id: "a", label: "Apple", displayOrder: 1 });
  const noLabel = dto({
    id: "b",
    label: undefined as unknown as string,
    displayOrder: 1,
  });
  // Both orderings must be safe (sort calls the comparator both ways).
  assert.doesNotThrow(() => compareDynamicFieldDTOs(withLabel, noLabel));
  assert.doesNotThrow(() => compareDynamicFieldDTOs(noLabel, withLabel));
  // An undefined label is coerced to "" → sorts before "Apple".
  assert.ok(compareDynamicFieldDTOs(noLabel, withLabel) < 0);
  assert.ok(compareDynamicFieldDTOs(withLabel, noLabel) > 0);
});

test("comparator: a full list with a label-less field sorts without throwing", () => {
  const list: ClientDynamicFieldDTO[] = [
    dto({ id: "c", label: "Cherry", displayOrder: 2 }),
    dto({ id: "z", label: undefined as unknown as string, displayOrder: 2 }),
    dto({ id: "a", label: "Apple", displayOrder: 1 }),
  ];
  assert.doesNotThrow(() => list.sort(compareDynamicFieldDTOs));
  // displayOrder is the primary key (1 before 2); within order 2 the
  // empty-label field sorts before "Cherry".
  assert.deepEqual(
    list.map((f) => f.id),
    ["a", "z", "c"],
  );
});

test("comparator: displayOrder is the primary key, label only the tiebreak", () => {
  // Lower displayOrder wins even when its label sorts later alphabetically.
  const early = dto({ id: "zzz", label: "Zzz", displayOrder: 1 });
  const late = dto({ id: "aaa", label: "Aaa", displayOrder: 5 });
  assert.ok(compareDynamicFieldDTOs(early, late) < 0);
});
