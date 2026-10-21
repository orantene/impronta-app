/**
 * TUL-1366: Platform Admin sets the Tulala service fee per plan. Platform-admin
 * only, 0-20%, audited, and no workspace or talent path can write it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const src = read("./admin-tier-service-fee.ts");

describe("admin-tier-service-fee action", () => {
  test("is a server action gated to platform admins before anything is read or written", () => {
    assert.match(src, /^"use server";/);
    assert.match(src, /isPlatformAdmin\(session\.profile\)/);
    const gate = src.indexOf("requirePlatformAdmin()");
    const write = src.indexOf('writeTierServiceFee(admin');
    assert.ok(gate > 0 && write > gate, "the gate runs before the write");
    assert.match(src, /assertNotImpersonating\(\)/);
  });

  test("validates 0-20% server-side with the shared converter and refuses anything else", () => {
    assert.match(src, /serviceFeePercentToBps\(/);
    assert.match(src, /between 0% and 20%/i);
  });

  test("only family workspace and talent tiers can carry a fee (never the client trust ladder)", () => {
    assert.match(src, /workspace/);
    assert.match(src, /"talent"/);
    assert.match(src, /client/i);
  });

  test("every change is audited with before, after and the actor", () => {
    assert.match(src, /recordCommerceAudit\(/);
    assert.match(src, /COMMERCE_AUDIT\.TIER_SERVICE_FEE_UPDATED/);
    assert.match(src, /before: \{ service_fee_bps/);
    assert.match(src, /after: \{ service_fee_bps/);
    assert.match(src, /actorId: gate\.userId/);
    assert.match(read("../billing/commerce-audit.ts"), /TIER_SERVICE_FEE_UPDATED: "platform\.commerce\.tier\.service_fee_updated"/);
  });

  test("no workspace, talent or public module writes the column", () => {
    const grep = (rel: string) => read(rel);
    // the only writers of product_tiers.service_fee_bps are server actions under server-actions/admin-*
    for (const f of ["../billing/pass-through-rate.ts", "../orders/purchase-collect.ts", "../orders/purchase-pass-through-collect.ts"]) {
      assert.doesNotMatch(grep(f), /service_fee_bps["']?\s*:/, f);
      assert.doesNotMatch(grep(f), /\.from\("product_tiers"\)/, f);
    }
  });

  test("the UI field lives in the tier drawer next to the plan prices", () => {
    const drawer = read("../../app/(workspace)/platform/admin/commerce/catalog/TierDrawer.tsx");
    assert.match(drawer, /ServiceFeeField/);
    const field = read("../../app/(workspace)/platform/admin/commerce/catalog/drawer/ServiceFeeField.tsx");
    assert.match(field, /updateTierServiceFee/);
    for (const f of ["en", "es"]) {
      const j = JSON.parse(read(`../../../messages/${f}.json`));
      const k = j.dashboard.platform.pricing.drawer.serviceFee;
      assert.ok(k && k.label && k.help && k.save && k.range, f);
    }
  });
});
