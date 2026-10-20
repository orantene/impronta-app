/**
 * TUL-1269 M2 (package E6, CALCULATION): only the right workspace role can
 * change payment methods, change or downgrade the plan, or edit the
 * workspace's commercial booking terms. A viewer / editor / manager is
 * workspace staff too, and used to pass every one of these.
 *
 * Unit half: the role -> capability matrix behind each gate, and the
 * "a downgrade must go down" rule. Source half: every mutating server action
 * asks requireWorkspaceStaffAction for the gate's capability before it
 * touches Stripe or the database, and plan writes run on the service role
 * (the held M1 trigger refuses plan_tier from a member's own session).
 * (mock.module is unusable under tsx, so the actions are pinned by source.)
 *
 * Run: npx tsx --test src/lib/billing/workspace-money-gates.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { roleGrantsCapability, TENANT_ROLE_KEYS } from "@/lib/access/roles";
import {
  WORKSPACE_MONEY_GATES,
  isStrictPlanDowngrade,
} from "./workspace-money-gates";

const HERE = dirname(fileURLToPath(import.meta.url));
const ACTIONS = join(HERE, "..", "server-actions");
const read = (f: string) => readFileSync(join(ACTIONS, f), "utf8");

// ─── Role matrix ─────────────────────────────────────────────────────────────

const ALLOWED: Record<keyof typeof WORKSPACE_MONEY_GATES, readonly string[]> = {
  paymentMethods: ["owner"],
  planChange: ["owner"],
  commercialTerms: ["owner", "admin"],
};

for (const [gate, cap] of Object.entries(WORKSPACE_MONEY_GATES)) {
  test(`${gate} (${cap}): only ${ALLOWED[gate as keyof typeof ALLOWED].join(" + ")} pass`, () => {
    for (const role of TENANT_ROLE_KEYS) {
      const expected = ALLOWED[gate as keyof typeof ALLOWED].includes(role);
      assert.equal(roleGrantsCapability(role, cap), expected, `${role} -> ${cap}`);
    }
  });
}

test("a viewer passes none of the money gates", () => {
  for (const cap of Object.values(WORKSPACE_MONEY_GATES)) {
    assert.equal(roleGrantsCapability("viewer", cap), false, cap);
  }
});

// ─── Downgrade direction ─────────────────────────────────────────────────────

test("isStrictPlanDowngrade: only a lower known plan counts", () => {
  assert.equal(isStrictPlanDowngrade("agency", "free"), true);
  assert.equal(isStrictPlanDowngrade("network", "studio"), true);
  assert.equal(isStrictPlanDowngrade("studio", "free"), true);
  // Same plan, or up: not a downgrade (the old action accepted "free -> network").
  assert.equal(isStrictPlanDowngrade("free", "free"), false);
  assert.equal(isStrictPlanDowngrade("free", "network"), false);
  assert.equal(isStrictPlanDowngrade("studio", "agency"), false);
  // Unknown current plan: refuse rather than guess.
  assert.equal(isStrictPlanDowngrade("legacy-weird", "free"), false);
  assert.equal(isStrictPlanDowngrade(null, "free"), false);
});

// ─── Source pins on the server actions ───────────────────────────────────────

/** Body of one exported async function, up to the next top-level export. */
function exported(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

function assertGateFirst(body: string, gate: string, firstSideEffect: string, label: string) {
  const gateAt = body.indexOf(`requireWorkspaceStaffAction({ capability: WORKSPACE_MONEY_GATES.${gate} })`);
  assert.ok(gateAt >= 0, `${label}: must ask for WORKSPACE_MONEY_GATES.${gate}`);
  const effectAt = body.indexOf(firstSideEffect);
  assert.ok(effectAt > gateAt, `${label}: gate must run before ${firstSideEffect}`);
}

test("payment methods: add / set default / remove need the billing gate", () => {
  const src = read("payment-methods.ts");
  assertGateFirst(exported(src, "createSetupIntent"), "paymentMethods", "stripe.setupIntents.create", "createSetupIntent");
  assertGateFirst(exported(src, "setDefaultPaymentMethod"), "paymentMethods", "stripe.customers.update", "setDefaultPaymentMethod");
  assertGateFirst(exported(src, "detachPaymentMethod"), "paymentMethods", "stripe.paymentMethods.detach", "detachPaymentMethod");
});

test("payment methods: a role refusal says forbidden, not unauthenticated", () => {
  const src = read("payment-methods.ts");
  for (const fn of ["createSetupIntent", "setDefaultPaymentMethod", "detachPaymentMethod"]) {
    assert.match(exported(src, fn), /reason: "forbidden"/, fn);
  }
});

test("plan downgrade: commit + restore need the billing gate; commit must go down", () => {
  const src = read("admin-plan-downgrade.ts");
  const commit = exported(src, "commitPlanDowngrade");
  assertGateFirst(commit, "planChange", '.from("agency_talent_roster")', "commitPlanDowngrade");
  assert.match(commit, /isStrictPlanDowngrade\(/);
  assert.ok(
    commit.indexOf("isStrictPlanDowngrade(") < commit.indexOf('.from("agency_talent_roster")'),
    "direction check runs before any roster row is archived",
  );
  assertGateFirst(
    exported(src, "restoreFromDowngradeArchive"),
    "planChange",
    '.from("agency_talent_roster")',
    "restoreFromDowngradeArchive",
  );
});

test("plan writes run on the service role, never the member's own session", () => {
  const downgrade = exported(read("admin-plan-downgrade.ts"), "commitPlanDowngrade");
  assert.match(downgrade, /const admin = createServiceRoleClient\(\);/);
  assert.match(downgrade, /await admin\s*\.from\("agencies"\)\s*\.update\(\{ plan_tier: v\.target_tier/);
  assert.doesNotMatch(downgrade, /await supabase\s*\.from\("agencies"\)\s*\.update/);

  const billing = exported(read("admin-billing.ts"), "changeWorkspacePlan");
  assertGateFirst(billing, "planChange", '.from("agencies")', "changeWorkspacePlan");
  assert.match(billing, /const admin = createServiceRoleClient\(\);/);
  assert.match(billing, /await admin\s*\.from\("agencies"\)\s*\.update\(/);
  assert.doesNotMatch(billing, /auth\.supabase\s*\.from\("agencies"\)/);
});

test("commercial terms: the write needs the settings gate", () => {
  const src = read("commercial-terms-tenant.ts");
  assertGateFirst(
    exported(src, "updateTenantCommercialTerms"),
    "commercialTerms",
    '.update({ settings: nextSettings',
    "updateTenantCommercialTerms",
  );
});
