import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HEADER_REGIONS_PLAN_DENIED_REASON,
  isHeaderRegionsEditAllowedForPlan,
  isShellMutationAllowedForPlan,
} from "./shell-plan-guard";

test("free plan cannot mutate site shell", () => {
  assert.equal(
    isShellMutationAllowedForPlan({
      systemTemplateKey: "site_shell",
      planTier: "free",
    }),
    false,
  );
});

test("studio and agency plans can mutate site shell", () => {
  assert.equal(
    isShellMutationAllowedForPlan({
      systemTemplateKey: "site_shell",
      planTier: "studio",
    }),
    true,
  );
  assert.equal(
    isShellMutationAllowedForPlan({
      systemTemplateKey: "site_shell",
      planTier: "agency",
    }),
    true,
  );
});

test("non-shell pages are always allowed by this guard", () => {
  assert.equal(
    isShellMutationAllowedForPlan({
      systemTemplateKey: "homepage",
      planTier: "free",
    }),
    true,
  );
});

// ── WF-6 — header regions (custom layout) plan gate ─────────────────────────

test("free plan cannot edit header regions", () => {
  assert.equal(isHeaderRegionsEditAllowedForPlan("free"), false);
});

test("paid plans can edit header regions", () => {
  for (const plan of ["studio", "agency", "network", "legacy"]) {
    assert.equal(
      isHeaderRegionsEditAllowedForPlan(plan),
      true,
      `${plan} should be allowed to edit header regions`,
    );
  }
});

test("an unknown or missing plan fails CLOSED on header regions", () => {
  // The failure mode this exists to stop: a garbage plan string reading as
  // paid because someone compared against "free" inline.
  assert.equal(isHeaderRegionsEditAllowedForPlan(null), false);
  assert.equal(isHeaderRegionsEditAllowedForPlan(undefined), false);
  assert.equal(isHeaderRegionsEditAllowedForPlan(""), false);
  assert.equal(isHeaderRegionsEditAllowedForPlan("enterprise-plus"), false);
});

test("the denial reason is plain language and names the upgrade", () => {
  assert.match(HEADER_REGIONS_PLAN_DENIED_REASON, /Studio/);
  assert.ok(
    !HEADER_REGIONS_PLAN_DENIED_REASON.includes("—"),
    "no em dashes in user-facing copy",
  );
});
