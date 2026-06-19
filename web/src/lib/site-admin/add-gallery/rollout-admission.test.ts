/**
 * rollout-admission.test.ts — X7 (per-surface rollout admission diff).
 *
 * Test runner: node:test + node:assert/strict (tsx --test)
 * Run:  node_modules/.bin/tsx --test src/lib/site-admin/add-gallery/rollout-admission.test.ts
 *
 * Covers the PURE per-surface admission evaluation:
 *   evaluateRolloutAdmission       — single (template, tenant) → verdict + reason
 *   evaluateRolloutAdmissionPerSurface — cross-product over the real surfaces
 *   isAdmitted / explainRolloutAdmission — verdict helpers
 *
 * The bar (builder-lab-polish-plan X7): a staged rollout's per-surface real reach
 * is auditable before assuming "published = everyone". The verdict must AGREE with
 * the FROZEN `templateRolloutAllowed` from rollout.ts (we re-derive the reason, we
 * do NOT re-implement the bucket math), and must distinguish admitted-via-allowlist
 * from admitted-via-bucket and denied-denylist from denied-outside-bucket.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateRolloutAdmission,
  evaluateRolloutAdmissionPerSurface,
  explainRolloutAdmission,
  isAdmitted,
  type RolloutAdmissionVerdict,
} from "./parity-probe";
import {
  deterministicBucket,
  templateRolloutAllowed,
  type TemplateRolloutFields,
} from "@/lib/site-admin/builder-core/templates/rollout";
import { PARITY_SURFACES } from "./parity-surface-descriptors";

const TPL = "tpl-x7";

function rollout(over: Partial<TemplateRolloutFields> = {}): TemplateRolloutFields {
  return {
    id: TPL,
    rollout_percentage: 100,
    tenant_allowlist: null,
    tenant_denylist: null,
    ...over,
  };
}

/** Find a tenant id that lands UNDER / AT-OR-OVER a given percentage for TPL. */
function tenantInBucket(predicate: (bucket: number) => boolean): string {
  for (let i = 0; i < 5000; i++) {
    const id = `tenant-${i}`;
    if (predicate(deterministicBucket(id, TPL))) return id;
  }
  throw new Error("no tenant found for predicate (should not happen)");
}

// ── single-surface admission verdicts ─────────────────────────────────────────

test("no tenant id ⇒ admitted-no-tenant (authors are never gated)", () => {
  const r = evaluateRolloutAdmission(rollout({ rollout_percentage: 1 }), null);
  assert.equal(r.verdict, "admitted-no-tenant");
  assert.equal(r.bucket, null);
  assert.equal(isAdmitted(r.verdict), true);

  const empty = evaluateRolloutAdmission(rollout({ rollout_percentage: 1 }), "");
  assert.equal(empty.verdict, "admitted-no-tenant");
});

test("100% (or unset) rollout ⇒ admitted-full", () => {
  assert.equal(
    evaluateRolloutAdmission(rollout({ rollout_percentage: 100 }), "t1").verdict,
    "admitted-full",
  );
  assert.equal(
    evaluateRolloutAdmission(rollout({ rollout_percentage: null }), "t1").verdict,
    "admitted-full",
  );
});

test("allowlisted tenant ⇒ admitted-allowlist even under a low ceiling", () => {
  const r = evaluateRolloutAdmission(
    rollout({ rollout_percentage: 1, tenant_allowlist: ["vip"] }),
    "vip",
  );
  assert.equal(r.verdict, "admitted-allowlist");
  assert.equal(isAdmitted(r.verdict), true);
});

test("denylisted tenant ⇒ denied-denylist even at 100% and on the allowlist", () => {
  const r = evaluateRolloutAdmission(
    rollout({
      rollout_percentage: 100,
      tenant_allowlist: ["x"],
      tenant_denylist: ["x"],
    }),
    "x",
  );
  assert.equal(r.verdict, "denied-denylist");
  assert.equal(isAdmitted(r.verdict), false);
});

test("0% rollout ⇒ denied-zero for any tenant", () => {
  const r = evaluateRolloutAdmission(rollout({ rollout_percentage: 0 }), "anyone");
  assert.equal(r.verdict, "denied-zero");
  assert.equal(isAdmitted(r.verdict), false);
});

test("tenant inside the % bucket ⇒ admitted-bucket", () => {
  // pick a tenant whose bucket is < 50 and run at 50%.
  const tenant = tenantInBucket((b) => b < 50);
  const r = evaluateRolloutAdmission(rollout({ rollout_percentage: 50 }), tenant);
  assert.equal(r.verdict, "admitted-bucket");
  assert.ok(r.bucket != null && r.bucket < 50);
});

test("tenant outside the % bucket ⇒ denied-bucket", () => {
  const tenant = tenantInBucket((b) => b >= 50);
  const r = evaluateRolloutAdmission(rollout({ rollout_percentage: 50 }), tenant);
  assert.equal(r.verdict, "denied-bucket");
  assert.ok(r.bucket != null && r.bucket >= 50);
});

// ── verdict AGREES with the frozen engine (no re-implementation drift) ─────────

test("every verdict's admitted-bit matches templateRolloutAllowed (frozen)", () => {
  const configs: TemplateRolloutFields[] = [
    rollout({ rollout_percentage: 100 }),
    rollout({ rollout_percentage: 0 }),
    rollout({ rollout_percentage: 33 }),
    rollout({ rollout_percentage: 7, tenant_allowlist: ["allow-me"] }),
    rollout({ rollout_percentage: 100, tenant_denylist: ["deny-me"] }),
  ];
  const tenants = [
    null,
    "",
    "allow-me",
    "deny-me",
    tenantInBucket((b) => b < 33),
    tenantInBucket((b) => b >= 33),
  ];
  for (const cfg of configs) {
    for (const tenant of tenants) {
      const { verdict } = evaluateRolloutAdmission(cfg, tenant);
      const frozen = templateRolloutAllowed(cfg, tenant == null || tenant === "" ? null : tenant);
      assert.equal(
        isAdmitted(verdict),
        frozen,
        `verdict ${verdict} for tenant=${tenant} disagrees with frozen engine (${frozen})`,
      );
    }
  }
});

// ── per-surface cross-product ─────────────────────────────────────────────────

test("per-surface diff: admitted on one surface, denied on another (real reach)", () => {
  // Same template, but it is denylisted ONLY on the workspace_page surface.
  const baseCfg = rollout({ rollout_percentage: 100 });
  const denyCfg = rollout({ rollout_percentage: 100, tenant_denylist: ["acme"] });

  const surfaces = evaluateRolloutAdmissionPerSurface({
    tenantId: "acme",
    rolloutBySurface: (s) => (s === "workspace_page" ? denyCfg : baseCfg),
  });

  // All four real surfaces are offered here.
  assert.equal(surfaces.length, PARITY_SURFACES.length);
  const bySurface = Object.fromEntries(surfaces.map((s) => [s.surface, s]));
  assert.equal(bySurface["talent_profile"].admitted, true);
  assert.equal(bySurface["talent_profile"].verdict, "admitted-full");
  assert.equal(bySurface["workspace_page"].admitted, false);
  assert.equal(bySurface["workspace_page"].verdict, "denied-denylist");
});

test("per-surface diff: 60% bucket admits on offered surfaces, omits not-offered", () => {
  const tenant = tenantInBucket((b) => b < 60);
  const cfg = rollout({ rollout_percentage: 60 });

  const surfaces = evaluateRolloutAdmissionPerSurface({
    tenantId: tenant,
    // Offer ONLY on talent_profile (model a target_context that excludes the rest).
    rolloutBySurface: (s) => (s === "talent_profile" ? cfg : null),
  });

  assert.equal(surfaces.length, 1);
  assert.equal(surfaces[0].surface, "talent_profile");
  assert.equal(surfaces[0].verdict, "admitted-bucket");
  assert.ok(surfaces[0].detail.includes("60%"));
});

test("per-surface diff carries a human label + agrees with the frozen engine", () => {
  const tenant = tenantInBucket((b) => b >= 25);
  const cfg = rollout({ rollout_percentage: 25 });
  const surfaces = evaluateRolloutAdmissionPerSurface({
    tenantId: tenant,
    rolloutBySurface: () => cfg,
  });
  for (const s of surfaces) {
    assert.equal(s.verdict, "denied-bucket");
    assert.equal(s.admitted, templateRolloutAllowed(cfg, tenant));
    assert.ok(s.surfaceLabel.length > 0);
  }
});

// ── explanation strings ───────────────────────────────────────────────────────

test("explainRolloutAdmission names the tenant + numbers per verdict", () => {
  const cases: Array<[RolloutAdmissionVerdict, number | null, number, string]> = [
    ["admitted-allowlist", 5, 10, "allowlist"],
    ["admitted-bucket", 3, 60, "bucket 3"],
    ["denied-denylist", 90, 100, "denylisted"],
    ["denied-bucket", 80, 60, "bucket 80"],
    ["denied-zero", 0, 0, "0%"],
    ["admitted-full", 1, 100, "100%"],
    ["admitted-no-tenant", null, 50, "never rollout-gated"],
  ];
  for (const [verdict, bucket, pct, needle] of cases) {
    const msg = explainRolloutAdmission(verdict, bucket, pct, "acme");
    assert.ok(msg.includes(needle), `"${msg}" should mention "${needle}"`);
  }
  // tenant id appears in allowlist/denylist/bucket explanations
  assert.ok(
    explainRolloutAdmission("denied-denylist", 1, 100, "acme").includes("acme"),
  );
});
