/**
 * Parity test: the new `lib/access/` module returns the same role-capability
 * verdicts as the legacy `lib/saas/capabilities.ts` and
 * `lib/site-admin/capabilities.ts` modules.
 *
 * If this test fails, the migration is no longer behavior-preserving.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  roleHasCapability as legacyRoleHasCapability,
  type Capability as LegacyCapability,
} from "@/lib/saas/capabilities";
import {
  rolePhase5HasCapability,
  PHASE_5_CAPABILITIES,
} from "@/lib/site-admin/capabilities";
import type { MembershipRole } from "@/lib/saas/tenant";

import {
  ROLE_CAPABILITIES,
  TENANT_ROLE_KEYS,
} from "@/lib/access/roles";
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  isKnownCapability,
} from "@/lib/access/capabilities";
import {
  PLAN_KEYS,
  PLAN_CATALOG,
} from "@/lib/access/plan-catalog";

const LEGACY_CAPABILITIES: readonly LegacyCapability[] = [
  "view_dashboard",
  "view_talent_roster",
  "view_client_list",
  "view_analytics",
  "view_private_client_data",
  "edit_talent_overlay",
  "manage_talent_roster",
  "publish_talent_to_storefront",
  "submit_hub_visibility",
  "edit_client_relationship",
  "delete_client_relationship",
  "create_inquiry",
  "coordinate_inquiry",
  "send_client_offer",
  "approve_offer_internal",
  "convert_to_booking",
  "cancel_inquiry",
  "edit_cms_pages",
  "publish_cms_pages",
  "edit_navigation",
  "edit_branding",
  "edit_storefront_layout",
  "manage_memberships",
  "manage_field_catalog",
  "manage_storefront_settings",
  "manage_agency_settings",
  "manage_billing",
  "transfer_ownership",
  "suspend_tenant",
];

test("registry has no duplicates and matches legacy + phase-5 union", () => {
  const keys = new Set(CAPABILITY_KEYS);
  assert.equal(keys.size, CAPABILITY_KEYS.length, "duplicate capability key in registry");
  // Expected size: 29 legacy + 14 phase-5 = 43.
  // (Audit memo said "42", off by one — there are 29 legacy capabilities,
  // not 28: dashboard/talent/client/inquiry/site/team/billing.)
  const expected = LEGACY_CAPABILITIES.length + PHASE_5_CAPABILITIES.length;
  assert.equal(CAPABILITY_KEYS.length, expected, `expected ${expected} capability keys`);
});

test("every CapabilityDef has a non-empty displayName and description", () => {
  for (const key of CAPABILITY_KEYS) {
    const def = CAPABILITIES[key];
    assert.ok(def.displayName.length > 0, `${key}: displayName missing`);
    assert.ok(def.description.length > 0, `${key}: description missing`);
  }
});

test("legacy capabilities are all in the new registry", () => {
  for (const cap of LEGACY_CAPABILITIES) {
    assert.ok(isKnownCapability(cap), `legacy capability "${cap}" missing from new registry`);
  }
});

test("phase 5 capabilities are all in the new registry", () => {
  for (const cap of PHASE_5_CAPABILITIES) {
    assert.ok(isKnownCapability(cap), `phase 5 capability "${cap}" missing from new registry`);
  }
});

test("new role-cap map matches legacy role-cap map for legacy capabilities", () => {
  for (const role of TENANT_ROLE_KEYS) {
    for (const cap of LEGACY_CAPABILITIES) {
      const legacy = legacyRoleHasCapability(role as MembershipRole, cap);
      const next = ROLE_CAPABILITIES[role].has(cap);
      assert.equal(
        next,
        legacy,
        `parity drift: role=${role} cap=${cap} legacy=${legacy} next=${next}`,
      );
    }
  }
});

test("new role-cap map matches legacy phase-5 role-cap map for phase-5 capabilities", () => {
  for (const role of TENANT_ROLE_KEYS) {
    for (const cap of PHASE_5_CAPABILITIES) {
      const legacy = rolePhase5HasCapability(role as MembershipRole, cap);
      const next = ROLE_CAPABILITIES[role].has(cap);
      assert.equal(
        next,
        legacy,
        `phase-5 parity drift: role=${role} cap=${cap} legacy=${legacy} next=${next}`,
      );
    }
  }
});

test("plan catalog has all 4 standard plans plus legacy", () => {
  for (const required of ["free", "studio", "agency", "network", "legacy"] as const) {
    assert.ok(PLAN_KEYS.includes(required), `missing plan key: ${required}`);
    assert.ok(PLAN_CATALOG[required], `missing plan def: ${required}`);
  }
});

test("plan ranks are unique and ordered", () => {
  const ranks = PLAN_KEYS.map((k) => PLAN_CATALOG[k].rank);
  const uniqueRanks = new Set(ranks);
  assert.equal(uniqueRanks.size, ranks.length, "duplicate plan rank");
});

test("special plans (legacy) are not visible and not self-serve", () => {
  const legacyPlan = PLAN_CATALOG.legacy;
  assert.equal(legacyPlan.isVisible, false, "legacy plan must not be visible");
  assert.equal(legacyPlan.isSelfServe, false, "legacy plan must not be self-serve");
});
