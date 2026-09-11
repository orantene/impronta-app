import test from "node:test";
import assert from "node:assert/strict";

import {
  canManageBilling,
  deriveHats,
  derivePreset,
  deriveWorkRole,
  workspaceNavContext,
  type WorkspaceNavContextInput,
} from "./nav-context";
import { destinationLabel, DESTINATIONS } from "./destinations";

// Real preset ids, not invented ones. `restaurant` sells a menu and books
// nobody; `salon_barber` books appointments; `agency` turns nothing on.
const CAFE = "restaurant";
const APPOINTMENTS = "salon_barber";

test("a menu with no appointments is a cafe, whatever the team size", () => {
  assert.equal(derivePreset({ industryPreset: CAFE }), "cafe");
  assert.equal(derivePreset({ industryPreset: CAFE, teamMemberCount: 1 }), "cafe");
  assert.equal(derivePreset({ industryPreset: CAFE, teamMemberCount: 40 }), "cafe");
  assert.equal(derivePreset({ industryPreset: "bar_club", teamMemberCount: 12 }), "cafe");
});

test("appointments and at most one person is solo", () => {
  assert.equal(derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: 1 }), "solo");
  assert.equal(derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: 0 }), "solo");
  assert.equal(derivePreset({ industryPreset: "studio_gym", teamMemberCount: 1 }), "solo");
});

test("appointments with a team is hybrid", () => {
  assert.equal(derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: 2 }), "hybrid");
  assert.equal(derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: 9 }), "hybrid");
});

test("the preset derivation fails OPEN to hybrid", () => {
  // hybrid is the shape that hides nothing. An unreadable setting must never
  // relabel or thin out a live workspace's nav.
  assert.equal(derivePreset({ industryPreset: undefined }), "hybrid");
  assert.equal(derivePreset({ industryPreset: null }), "hybrid");
  assert.equal(derivePreset({ industryPreset: 17 }), "hybrid");
  assert.equal(derivePreset({ industryPreset: "not_a_preset" }), "hybrid");
  assert.equal(derivePreset({ industryPreset: "agency", teamMemberCount: 1 }), "hybrid");
  // An unknown team size is not "one person": it falls through, it does not guess.
  assert.equal(derivePreset({ industryPreset: APPOINTMENTS }), "hybrid");
  assert.equal(
    derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: Number.NaN }),
    "hybrid",
  );
});

test("the five membership roles collapse onto three hats", () => {
  assert.equal(deriveWorkRole("owner"), "owner");
  assert.equal(deriveWorkRole("admin"), "manager");
  assert.equal(deriveWorkRole("manager"), "manager");
  assert.equal(deriveWorkRole("editor"), "assistant");
  assert.equal(deriveWorkRole("viewer"), "assistant");
  assert.equal(deriveWorkRole("  Owner  "), "owner");
});

test("an unknown role fails CLOSED to assistant", () => {
  // Opposite direction from the preset above, on purpose: this one decides
  // whether a person is shown a billing link.
  assert.equal(deriveWorkRole("cashier"), "assistant");
  assert.equal(deriveWorkRole(""), "assistant");
  assert.equal(deriveWorkRole(undefined), "assistant");
  assert.equal(deriveWorkRole({ role: "owner" }), "assistant");
});

test("professional is a fourth hat, not a rung", () => {
  assert.deepEqual(deriveHats({ membershipRole: "owner", hasTalentProfile: true }), {
    role: "owner",
    professional: true,
  });
  assert.deepEqual(deriveHats({ membershipRole: "viewer", hasTalentProfile: true }), {
    role: "assistant",
    professional: true,
  });
  assert.deepEqual(deriveHats({ membershipRole: "owner" }), {
    role: "owner",
    professional: false,
  });
});

test("only an owner manages billing, mirroring roles.ts", () => {
  assert.ok(canManageBilling("owner"));
  assert.ok(!canManageBilling("manager"));
  assert.ok(!canManageBilling("assistant"));
});

test("the derived preset is what the labels read", () => {
  const cafe = derivePreset({ industryPreset: CAFE, teamMemberCount: 6 });
  assert.equal(destinationLabel(DESTINATIONS.catalog, cafe), "Menu & catalog");
  assert.equal(destinationLabel(DESTINATIONS.people, cafe), "Team");

  const solo = derivePreset({ industryPreset: APPOINTMENTS, teamMemberCount: 1 });
  assert.equal(destinationLabel(DESTINATIONS.catalog, solo), "Services");

  const hybrid = derivePreset({ industryPreset: "agency" });
  assert.equal(destinationLabel(DESTINATIONS.catalog, hybrid), "Catalog");
});

// ── workspaceNavContext — the whole context, from the bridge ─────────

const BRIDGE: WorkspaceNavContextInput = {
  tenantIdentity: { industryPreset: CAFE },
  sessionIdentity: { role: "manager", canManageBilling: false },
  workspaceType: "business",
  plan: "studio",
  visiblePages: ["overview", "reservations", "events", "pos"],
  teamMemberCount: 12,
  hasTalentProfile: false,
  fallbackRole: "viewer",
};

test("the nav context is built from the bridge objects, whole", () => {
  assert.deepEqual(workspaceNavContext(BRIDGE), {
    workspaceType: "business",
    plan: "studio",
    preset: "cafe",
    role: "manager",
    professional: false,
    takesReservations: true,
    runsEvents: true,
    posEnabled: true,
    canManageBilling: false,
  });
});

test("the preset is READ off the tenant row, not defaulted", () => {
  // The defect: a caller holding the tenant row passed `undefined` anyway, and
  // every workspace came out `hybrid`. Each of these is a different answer, so
  // a context builder that ignored its input could not pass all three.
  const at = (industryPreset: unknown, teamMemberCount: number) =>
    workspaceNavContext({ ...BRIDGE, tenantIdentity: { industryPreset }, teamMemberCount }).preset;
  assert.equal(at(CAFE, 12), "cafe");
  assert.equal(at(APPOINTMENTS, 1), "solo");
  assert.equal(at(APPOINTMENTS, 12), "hybrid");
  assert.equal(at(null, 12), "hybrid");
});

test("a missing tenant bridge is standalone mode, not a crash", () => {
  const standalone = workspaceNavContext({
    ...BRIDGE,
    tenantIdentity: null,
    sessionIdentity: null,
  });
  assert.equal(standalone.preset, "hybrid", "no tenant row relabels nothing");
  assert.equal(standalone.role, "assistant", "the shell's own role fell back closed");
  assert.equal(standalone.canManageBilling, false, "billing is not granted by absence");
});

test("the server's billing answer wins, and the role ladder answers otherwise", () => {
  const granted = workspaceNavContext({
    ...BRIDGE,
    sessionIdentity: { role: "assistant", canManageBilling: true },
  });
  assert.equal(granted.canManageBilling, true, "a server-resolved capability was overruled");

  const owner = workspaceNavContext({ ...BRIDGE, sessionIdentity: { role: "owner" } });
  assert.equal(owner.canManageBilling, true, "an owner with no server answer manages billing");

  const manager = workspaceNavContext({ ...BRIDGE, sessionIdentity: { role: "manager" } });
  assert.equal(manager.canManageBilling, false);
});

test("the tenant flags are read back off visiblePages, never guessed", () => {
  const quiet = workspaceNavContext({ ...BRIDGE, visiblePages: ["overview", "messages"] });
  assert.equal(quiet.takesReservations, false);
  assert.equal(quiet.runsEvents, false);
  assert.equal(quiet.posEnabled, false);
});
