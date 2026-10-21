/**
 * TUL-1708 (security sweep, area group F — billing & subscription settings).
 *
 * `requireWorkspaceStaffAction()` defaults to `agency.workspace.view`, which
 * every tenant role down to `viewer` holds. Eight billing/subscription
 * server-action files called it bare on write paths, so a viewer who could
 * merely VIEW a workspace could cancel/pause/reactivate its subscription,
 * downgrade its plan, connect/disconnect its Stripe payout account, or
 * change its pricing defaults / default currency.
 *
 * Fixed in this PR (bare guard -> capability wired into the guard):
 *   - cancel-subscription.ts        cancelSubscription, reactivateSubscription,
 *                                   pauseSubscription  -> manage_agency_settings
 *   - admin-stripe-connect.ts       every write action (all but the pure-read
 *                                   snapshot)           -> agency.payout_account.manage
 *   - admin-pricing-defaults.ts     updateTenantPricingDefaults -> manage_agency_settings
 *   - admin-workspace-default-currency.ts
 *                                   updateAgencyDefaultCurrency -> manage_agency_settings
 *
 * Already correct on main (pinned here so this group doesn't regress):
 *   - payment-methods.ts, admin-plan-downgrade.ts, commercial-terms-tenant.ts
 *     (writers already gated via WORKSPACE_MONEY_GATES)
 *   - payment-providers.ts (the whole file is a documented read)
 *
 * Capability choice, from `lib/access/capabilities.ts` + `lib/access/roles.ts`
 * (never invented — both keys pre-exist the registry):
 *   - `manage_agency_settings` (admin + owner): matches the EXISTING, already
 *     explicit "owner or admin" business rule coded in cancelSubscription /
 *     reactivateSubscription, and the existing secondary `requireCapability`
 *     check already guarding the pricing-defaults / default-currency writes.
 *   - `agency.payout_account.manage` (owner only): "Configure the
 *     agency-level account that receives platform payouts" — an exact,
 *     pre-existing fit for Stripe Connect, stricter than
 *     `manage_agency_settings` because it is owner-class billing, same tier
 *     as `manage_billing`.
 *
 * Two halves, same shape as `lib/billing/workspace-money-gates.test.ts`:
 *   1. Role matrix — which roles actually hold each capability.
 *   2. Source pins — every write call site in the 4 touched files asks for
 *      that capability; every read call site in all 8 files is unchanged
 *      (still the bare default), so this sweep cannot be mistaken for
 *      "lock everything down".
 *
 * Run: npx tsx --test src/lib/server-actions/tul1708-billing-settings-capabilities.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { roleGrantsCapability, TENANT_ROLE_KEYS } from "@/lib/access/roles";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(HERE, f), "utf8");

// ─── 1. Role matrix ───────────────────────────────────────────────────────

const ALLOWED: Record<string, readonly string[]> = {
  manage_agency_settings: ["admin", "owner"],
  "agency.payout_account.manage": ["owner"],
};

for (const [cap, allowed] of Object.entries(ALLOWED)) {
  test(`${cap}: only ${allowed.join(" + ")} pass`, () => {
    for (const role of TENANT_ROLE_KEYS) {
      assert.equal(
        roleGrantsCapability(role, cap as never),
        allowed.includes(role),
        `${role} -> ${cap}`,
      );
    }
  });
}

test("a viewer passes neither capability used in this area", () => {
  for (const cap of Object.keys(ALLOWED)) {
    assert.equal(roleGrantsCapability("viewer", cap as never), false, cap);
  }
});

test("an editor passes neither capability used in this area", () => {
  for (const cap of Object.keys(ALLOWED)) {
    assert.equal(roleGrantsCapability("editor", cap as never), false, cap);
  }
});

test("a manager passes neither capability used in this area", () => {
  // The pre-existing "owner or admin" rule in cancel-subscription.ts, and the
  // pre-existing manage_agency_settings checks elsewhere, both exclude
  // manager — confirm wiring the capability into the guard didn't loosen that.
  for (const cap of Object.keys(ALLOWED)) {
    assert.equal(roleGrantsCapability("manager", cap as never), false, cap);
  }
});

// ─── 2. Source pins ───────────────────────────────────────────────────────

/** Body of one exported async function, up to the next top-level export. */
function exported(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

/** Count of a literal substring in `src`. */
function count(src: string, needle: string): number {
  return src.split(needle).length - 1;
}

test("cancel-subscription.ts: every action is gated, no bare guard remains", () => {
  const src = read("cancel-subscription.ts");
  assert.equal(count(src, "await requireWorkspaceStaffAction();"), 0, "no bare guard left");
  assert.equal(
    count(src, 'await requireWorkspaceStaffAction({ capability: "manage_agency_settings" });'),
    3,
    "cancelSubscription, reactivateSubscription, pauseSubscription",
  );
  for (const fn of ["cancelSubscription", "reactivateSubscription", "pauseSubscription"]) {
    assert.match(
      exported(src, fn),
      /requireWorkspaceStaffAction\(\{ capability: "manage_agency_settings" \}\)/,
      fn,
    );
  }
});

test("admin-stripe-connect.ts: every write asks for the payout-account capability; the snapshot read stays default", () => {
  const src = read("admin-stripe-connect.ts");
  const WRITE_FNS = [
    "ensureConnectedAccountAction",
    "getConnectOnboardingLinkAction",
    "ensureWorkspacePayoutAccount",
    "getConnectAccountSessionAction",
    "getConnectDashboardLinkAction",
    "refreshConnectStatusAction",
    "disconnectStripeAccountAction",
  ];
  for (const fn of WRITE_FNS) {
    assert.match(
      exported(src, fn),
      /authorizeForSlug\(tenantSlug, "agency\.payout_account\.manage"\)/,
      fn,
    );
  }
  // The pure DB read (no Stripe call) keeps the bare default — reads are
  // explicitly out of scope for this sweep.
  const readFn = exported(src, "getConnectSnapshotAction");
  assert.match(readFn, /authorizeForSlug\(tenantSlug\);/);
  assert.doesNotMatch(readFn, /agency\.payout_account\.manage/);
  // Total call-site count sanity: 7 writes gated + 1 read ungated.
  assert.equal(count(src, 'authorizeForSlug(tenantSlug, "agency.payout_account.manage")'), 7);
  assert.equal(count(src, "authorizeForSlug(tenantSlug);"), 1);
});

test("admin-pricing-defaults.ts: the write is gated; the load stays default", () => {
  const src = read("admin-pricing-defaults.ts");
  assert.match(
    exported(src, "updateTenantPricingDefaults"),
    /requireWorkspaceStaffAction\(\{ capability: "manage_agency_settings" \}\)/,
  );
  assert.match(
    exported(src, "loadTenantPricingDefaultsAction"),
    /await requireWorkspaceStaffAction\(\);/,
  );
  assert.equal(count(src, "await requireWorkspaceStaffAction();"), 1, "only the read is bare");
});

test("admin-workspace-default-currency.ts: the write is gated; the load stays default", () => {
  const src = read("admin-workspace-default-currency.ts");
  assert.match(
    exported(src, "updateAgencyDefaultCurrency"),
    /requireWorkspaceStaffAction\(\{ capability: "manage_agency_settings" \}\)/,
  );
  assert.match(
    exported(src, "loadAgencyDefaultCurrency"),
    /await requireWorkspaceStaffAction\(\);/,
  );
  assert.equal(count(src, "await requireWorkspaceStaffAction();"), 1, "only the read is bare");
});

// ─── Regression pins: the 4 files that were ALREADY correct on main ───────
// (not touched by this PR — pinned so a future edit can't silently re-widen
// them back to the viewer default.)

test("payment-methods.ts: writers already use the billing gate; the list stays default", () => {
  const src = read("payment-methods.ts");
  for (const fn of ["createSetupIntent", "setDefaultPaymentMethod", "detachPaymentMethod"]) {
    assert.match(exported(src, fn), /WORKSPACE_MONEY_GATES\.paymentMethods/, fn);
  }
  assert.match(exported(src, "listPaymentMethods"), /await requireWorkspaceStaffAction\(\);/);
});

test("admin-plan-downgrade.ts: commit + restore already use the billing gate; preflight stays default", () => {
  const src = read("admin-plan-downgrade.ts");
  for (const fn of ["commitPlanDowngrade", "restoreFromDowngradeArchive"]) {
    assert.match(exported(src, fn), /WORKSPACE_MONEY_GATES\.planChange/, fn);
  }
  assert.match(exported(src, "getDowngradePreflight"), /await requireWorkspaceStaffAction\(\);/);
});

test("commercial-terms-tenant.ts: the write already uses the settings gate; the load stays default", () => {
  const src = read("commercial-terms-tenant.ts");
  assert.match(
    exported(src, "updateTenantCommercialTerms"),
    /WORKSPACE_MONEY_GATES\.commercialTerms/,
  );
  assert.match(exported(src, "loadTenantCommercialTerms"), /await requireWorkspaceStaffAction\(\);/);
});

test("payment-providers.ts: the whole file is a documented read, stays default", () => {
  const src = read("payment-providers.ts");
  assert.match(exported(src, "getPaymentProviderStatus"), /await requireWorkspaceStaffAction\(\);/);
});
