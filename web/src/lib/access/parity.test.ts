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
  capabilityGating,
  type CapabilityKey,
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

test("registry has no duplicates", () => {
  const keys = new Set(CAPABILITY_KEYS);
  assert.equal(keys.size, CAPABILITY_KEYS.length, "duplicate capability key in registry");
});

test("registry contains all expected capability sets", () => {
  // Legacy: 29 keys. Phase 5: 14 keys.
  // Talent-relationship model (docs/talent-relationship-model.md): 14 keys.
  // Transaction architecture (docs/transaction-architecture.md): 10 keys.
  // Talent monetization (docs/talent-monetization.md): 8 keys.
  // Total: 75.
  const TALENT_RELATIONSHIP_KEYS: readonly CapabilityKey[] = [
    "agency.settings.edit_join_mode",
    "agency.talent.create",
    "agency.talent.invite_to_claim",
    "agency.roster.set_exclusive",
    "agency.roster.set_hub_visibility",
    "agency.roster.view_external_relationships",
    "talent.visibility.manage_self",
    "talent.hub.apply",
    "talent.hub.leave",
    "talent.agency.apply",
    "talent.agency.exit",
    "talent.profile.claim",
    "platform.hub.create",
    "platform.hub.set_criteria",
  ];
  const TRANSACTION_KEYS: readonly CapabilityKey[] = [
    "booking.payment.select_receiver",
    "booking.payment.change_receiver",
    "booking.payment.request",
    "booking.payment.mark_received",
    "booking.payment.refund",
    "booking.payment.payout_mark_external",
    "payout_account.connect_self",
    "agency.payout_account.manage",
    "platform.payments.view_all",
    "platform.fee.configure",
  ];
  const TALENT_MONETIZATION_KEYS: readonly CapabilityKey[] = [
    "talent.subscription.upgrade",
    "talent.subscription.downgrade",
    "talent.page.edit",
    "talent.page.publish",
    "talent.page.set_template",
    "talent.page.enable_module",
    "talent.page.connect_custom_domain",
    "platform.talent_plans.configure",
    // Added with founder's exclusivity-distribution refinement
    // (page ownership stays with talent; distribution control becomes
    // relationship-dependent under exclusive). See talent-monetization.md §7a.
    "agency.roster.set_personal_page_distribution",
  ];
  for (const key of [
    ...TALENT_RELATIONSHIP_KEYS,
    ...TRANSACTION_KEYS,
    ...TALENT_MONETIZATION_KEYS,
  ]) {
    assert.ok(isKnownCapability(key), `capability "${key}" missing`);
  }
  const expected =
    LEGACY_CAPABILITIES.length +
    PHASE_5_CAPABILITIES.length +
    TALENT_RELATIONSHIP_KEYS.length +
    TRANSACTION_KEYS.length +
    TALENT_MONETIZATION_KEYS.length;
  assert.equal(CAPABILITY_KEYS.length, expected, `expected ${expected} capability keys`);
});

test("plans split correctly by audience", () => {
  const workspacePlans = Object.values(PLAN_CATALOG).filter((p) => p.audience === "workspace");
  const talentPlans = Object.values(PLAN_CATALOG).filter((p) => p.audience === "talent");
  assert.equal(workspacePlans.length, 5, "expected 5 workspace plans");
  assert.equal(talentPlans.length, 3, "expected 3 talent plans (Basic, Pro, Portfolio)");

  // Talent_basic is the baseline — free, hidden from pricing page.
  const basic = PLAN_CATALOG.talent_basic;
  assert.equal(basic.audience, "talent");
  assert.equal(basic.monthlyPriceCents, 0);
  assert.equal(basic.isVisible, false, "talent_basic must be hidden (it's the default)");
  assert.equal(basic.isSelfServe, true);

  // Portfolio is the only talent tier with a custom-domain limit.
  const portfolio = PLAN_CATALOG.talent_portfolio;
  assert.equal(portfolio.audience, "talent");
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

test("plan ranks are unique within each audience", () => {
  // Workspace and talent audiences have independent rank spaces. A plan's
  // rank is only compared to plans of the same audience.
  for (const audience of ["workspace", "talent"] as const) {
    const ranks = Object.values(PLAN_CATALOG)
      .filter((p) => p.audience === audience)
      .map((p) => p.rank);
    const uniqueRanks = new Set(ranks);
    assert.equal(
      uniqueRanks.size,
      ranks.length,
      `duplicate plan rank within audience "${audience}"`,
    );
  }
});

test("special plans (legacy) are not visible and not self-serve", () => {
  const legacyPlan = PLAN_CATALOG.legacy;
  assert.equal(legacyPlan.isVisible, false, "legacy plan must not be visible");
  assert.equal(legacyPlan.isSelfServe, false, "legacy plan must not be self-serve");
});

test("relationship-gated capabilities are NOT in any role's role-capability set", () => {
  // talent-self and exclusivity-conditional capabilities are gated by
  // relationship state, not by tenant-membership role. They must not be
  // role-granted; the resolver wires the relationship-state check
  // separately. See docs/talent-relationship-model.md §10.
  for (const key of CAPABILITY_KEYS) {
    const def = CAPABILITIES[key];
    const gating = capabilityGating(def);
    if (gating === "relationship" || gating === "always") {
      for (const role of TENANT_ROLE_KEYS) {
        assert.ok(
          !ROLE_CAPABILITIES[role].has(key),
          `${role} must not have role-grant for relationship-gated capability "${key}"`,
        );
      }
    }
  }
});

test("platform_role-gated capabilities are NOT in any tenant role's set", () => {
  for (const key of CAPABILITY_KEYS) {
    const def = CAPABILITIES[key];
    if (capabilityGating(def) === "platform_role") {
      for (const role of TENANT_ROLE_KEYS) {
        assert.ok(
          !ROLE_CAPABILITIES[role].has(key),
          `${role} must not have role-grant for platform-only capability "${key}"`,
        );
      }
    }
  }
});
