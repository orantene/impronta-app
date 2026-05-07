import assert from "node:assert/strict";
import { test } from "node:test";

import { isShellMutationAllowedForPlan } from "./shell-plan-guard";

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
