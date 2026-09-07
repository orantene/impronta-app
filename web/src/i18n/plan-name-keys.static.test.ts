import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PLAN_CATALOG } from "@/lib/access/plan-catalog";

/**
 * Every plan a workspace can hold must have a plan-name message, in every
 * locale.
 *
 * WHY THIS NEEDS A GUARD RATHER THAN CARE
 * ---------------------------------------
 * Two surfaces build the message key by string concatenation:
 *
 *   t(`dashboard.adminWorkspace.planName${plan[0].toUpperCase()}${plan.slice(1)}`)
 *
 * in BillingPage.tsx and WorkspacePageView.tsx. A constructed key cannot be
 * checked by the usual "is this key used / is this key defined" tooling,
 * because neither half of the string exists in the source. Adding a plan to
 * PLAN_CATALOG therefore silently arms a missing-key render on the two pages a
 * customer visits to look at their own plan.
 *
 * That is not hypothetical. `planNameWebsite` and `planNameLegacy` were both
 * absent from en and es while `website` and `legacy` were live catalog keys.
 * Website is the $12 tier, so the first customer on the tier we are trying to
 * sell would have seen a raw i18n key where the plan name goes.
 *
 * The fix is this test, not vigilance: it fails on the NEXT plan added, before
 * anyone can be on it.
 */

const LOCALES = ["en", "es"] as const;

function planNameKey(planKey: string): string {
  return `planName${planKey.charAt(0).toUpperCase()}${planKey.slice(1)}`;
}

function adminWorkspace(locale: string): Record<string, unknown> {
  const raw = readFileSync(
    join(process.cwd(), "messages", `${locale}.json`),
    "utf8",
  );
  const doc = JSON.parse(raw) as {
    dashboard: { adminWorkspace: Record<string, unknown> };
  };
  return doc.dashboard.adminWorkspace;
}

/**
 * WORKSPACE-audience plans only. `PLAN_CATALOG` also holds talent plans
 * (talent_basic, talent_pro, talent_portfolio), which are sold to an
 * individual and never reach `dashboard.adminWorkspace`. Asserting on those
 * would fail for a page they cannot appear on, and a guard that cries about
 * the wrong surface gets muted rather than fixed.
 */
function workspacePlans(): string[] {
  return Object.values(PLAN_CATALOG)
    .filter((p) => p.audience === "workspace")
    .map((p) => p.key);
}

test("every workspace plan has a plan-name message in every locale", () => {
  const plans = workspacePlans();
  assert.ok(plans.length > 0, "the catalog must not be empty");

  for (const locale of LOCALES) {
    const bag = adminWorkspace(locale);
    const missing = plans
      .map(planNameKey)
      .filter((k) => typeof bag[k] !== "string" || (bag[k] as string).trim() === "");
    assert.deepEqual(
      missing,
      [],
      `${locale}.json is missing plan-name message(s): ${missing.join(", ")}`,
    );
  }
});

test("the key this test builds is the key the pages build", () => {
  // If the surfaces change how they construct the key, this test would keep
  // passing while checking a key nobody reads. Pin the construction against
  // the source of both call sites.
  for (const file of [
    "src/components/admin/shell/internal/page-modules/BillingPage.tsx",
    "src/components/admin/shell/internal/page-modules/WorkspacePageView.tsx",
  ]) {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    assert.match(
      src,
      /dashboard\.adminWorkspace\.planName\$\{/,
      `${file} no longer builds the plan-name key the way this test assumes`,
    );
  }
});

test("a plan-name message never leaks the message key itself", () => {
  // The failure this catches is a missing translation rendering as
  // "dashboard.adminWorkspace.planNameWebsite" where the plan name goes, which
  // is what the two pages did for `website` before this file existed.
  //
  // NOT asserted: that the value differs from the plan key. "Free" is the
  // correct name for `free`, and forbidding that would be a guard inventing a
  // rule the product does not have.
  for (const locale of LOCALES) {
    const bag = adminWorkspace(locale);
    for (const plan of workspacePlans()) {
      const value = bag[planNameKey(plan)] as string;
      assert.doesNotMatch(
        value,
        /^dashboard\.|planName/,
        `${locale}.${planNameKey(plan)} renders a message key, not a name`,
      );
    }
  }
});
