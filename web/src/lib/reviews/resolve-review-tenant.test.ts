import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { resolveReviewTenantId } from "./resolve-review-tenant";

const HUB = { tenantId: "hub-tenant-id" };

// Fake portal-scope resolver: only callers related to the tenant get a scope,
// regardless of agencies.kind (the real one has no kind filter).
const related = async (slug: string) => (slug === "hub" ? HUB : null);
const unrelated = async () => null;

test("accepts a hub-kind tenant the caller is related to", async () => {
  assert.equal(await resolveReviewTenantId("hub", related), "hub-tenant-id");
  assert.equal(await resolveReviewTenantId("  hub  ", related), "hub-tenant-id");
});

test("rejects an unrelated caller and blank slugs", async () => {
  assert.equal(await resolveReviewTenantId("hub", unrelated), null);
  assert.equal(await resolveReviewTenantId("", related), null);
  assert.equal(await resolveReviewTenantId("   ", related), null);
});

test("review actions resolve via the portal scope, not the agency-only RPC", () => {
  for (const f of ["review-actions.ts", "review-request-actions.ts", "testimonial-actions.ts"]) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.ok(!/rpc\(\s*"resolve_public_tenant_by_slug"/.test(src), `${f} still calls the RPC`);
    assert.ok(!/function resolveTenantId/.test(src), `${f} still has a local resolver`);
    assert.ok(src.includes("resolveReviewTenantId("), `${f} must use the shared resolver`);
  }
  const helper = readFileSync(new URL("./resolve-review-tenant.ts", import.meta.url), "utf8");
  assert.ok(helper.includes("getTenantPortalScopeBySlug"));
  assert.ok(!helper.includes("resolve_public_tenant_by_slug\","));
});
