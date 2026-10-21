/**
 * pipeline-write-capabilities.test.ts — TUL-1708 (area C: inquiries,
 * pipeline & call sheets).
 *
 * Role-matrix test for `PIPELINE_WRITE_CAPABILITY`: every action in the map
 * must point at a real, non-deprecated capability key, and that capability
 * must NOT be held by `viewer` (the bug this sweep fixes — the bare
 * `requireWorkspaceStaffAction()` / `staff()` guard defaults to
 * `agency.workspace.view`, which `viewer` holds). `editor` and above's
 * access is asserted per the capability's actual tier rather than assumed,
 * so this fails loudly if `roles.ts` ever moves a capability between tiers.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ROLE_CAPABILITIES, TENANT_ROLE_KEYS, isKnownCapability, getCapability } from "@/lib/access";
import { PIPELINE_WRITE_CAPABILITY } from "./pipeline-write-capabilities";

const VIEWER_DEFAULT_CAPABILITY = "agency.workspace.view";

test("every PIPELINE_WRITE_CAPABILITY value is a known, non-deprecated capability key", () => {
  for (const [action, capability] of Object.entries(PIPELINE_WRITE_CAPABILITY)) {
    assert.ok(isKnownCapability(capability), `${action}: "${capability}" is not a registered capability`);
    const def = getCapability(capability);
    assert.ok(def, `${action}: capability "${capability}" has no definition`);
    assert.equal(def!.deprecated, false, `${action}: capability "${capability}" is deprecated`);
  }
});

test("no PIPELINE_WRITE_CAPABILITY value is the bare-guard default (agency.workspace.view) — that is the exact bug this sweep fixes", () => {
  for (const [action, capability] of Object.entries(PIPELINE_WRITE_CAPABILITY)) {
    assert.notEqual(
      capability,
      VIEWER_DEFAULT_CAPABILITY,
      `${action}: must not resolve back to the viewer-held default`,
    );
  }
});

test("role matrix: viewer never holds any capability assigned to a pipeline write", () => {
  const viewerCaps = ROLE_CAPABILITIES.viewer;
  for (const [action, capability] of Object.entries(PIPELINE_WRITE_CAPABILITY)) {
    assert.equal(
      viewerCaps.has(capability),
      false,
      `${action}: viewer must NOT hold "${capability}" — a viewer could perform this write`,
    );
  }
});

test("role matrix: for every assigned capability, the lowest role that holds it is editor or higher, and every role above it also holds it (monotonic grant)", () => {
  const usedCapabilities = new Set(Object.values(PIPELINE_WRITE_CAPABILITY));
  for (const capability of usedCapabilities) {
    const holders = TENANT_ROLE_KEYS.filter((role) => ROLE_CAPABILITIES[role].has(capability));
    assert.ok(holders.length > 0, `capability "${capability}" is granted to no role at all`);
    assert.ok(!holders.includes("viewer"), `capability "${capability}" must not be viewer-held`);

    // Monotonic: roles are ranked viewer < editor < manager < admin < owner.
    // Once a role holds the capability, every higher-ranked role must too
    // (ROLE_CAPABILITIES builds each tier by spreading the one below it).
    const rank = Object.fromEntries(TENANT_ROLE_KEYS.map((r, i) => [r, i]));
    const minRank = Math.min(...holders.map((r) => rank[r]));
    for (const role of TENANT_ROLE_KEYS) {
      if (rank[role] >= minRank) {
        assert.ok(
          ROLE_CAPABILITIES[role].has(capability),
          `capability "${capability}": ${role} (rank ${rank[role]}) should hold it once ${TENANT_ROLE_KEYS[minRank]} does`,
        );
      }
    }
  }
});

test("coordinate_inquiry / convert_to_booking / cancel_inquiry / create_inquiry / booking.payment.request are manager-tier or higher", () => {
  // Pins the specific tiers this sweep relies on so a future roles.ts edit
  // that silently loosens one of these is caught here, not in production.
  const managerPlus: readonly string[] = [
    "coordinate_inquiry",
    "convert_to_booking",
    "cancel_inquiry",
    "create_inquiry",
    "booking.payment.request",
  ];
  for (const cap of managerPlus) {
    assert.equal(ROLE_CAPABILITIES.viewer.has(cap as never), false, `${cap}: viewer must not hold it`);
    assert.equal(ROLE_CAPABILITIES.editor.has(cap as never), false, `${cap}: editor must not hold it`);
    assert.ok(ROLE_CAPABILITIES.manager.has(cap as never), `${cap}: manager must hold it`);
    assert.ok(ROLE_CAPABILITIES.admin.has(cap as never), `${cap}: admin must hold it`);
    assert.ok(ROLE_CAPABILITIES.owner.has(cap as never), `${cap}: owner must hold it`);
  }
});

test("manage_agency_settings is admin-tier or higher (manager does NOT hold it — workspace settings outrank pipeline coordination)", () => {
  assert.equal(ROLE_CAPABILITIES.viewer.has("manage_agency_settings" as never), false);
  assert.equal(ROLE_CAPABILITIES.editor.has("manage_agency_settings" as never), false);
  assert.equal(ROLE_CAPABILITIES.manager.has("manage_agency_settings" as never), false);
  assert.ok(ROLE_CAPABILITIES.admin.has("manage_agency_settings" as never));
  assert.ok(ROLE_CAPABILITIES.owner.has("manage_agency_settings" as never));
});

test("edit_client_relationship is editor-tier or higher", () => {
  assert.equal(ROLE_CAPABILITIES.viewer.has("edit_client_relationship" as never), false);
  assert.ok(ROLE_CAPABILITIES.editor.has("edit_client_relationship" as never));
  assert.ok(ROLE_CAPABILITIES.manager.has("edit_client_relationship" as never));
});
