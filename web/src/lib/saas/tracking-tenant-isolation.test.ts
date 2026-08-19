/**
 * tracking-tenant-isolation.test.ts — one tenant's trackers must never run on a
 * site that does not own them.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM lib/site-admin/tracking.test.ts
 * ────────────────────────────────────────────────────────────────────
 * The other file proves the whole rule set — validation, settings merging, the
 * emitted snippets, the CSP pairing — and runs in `test:builder-capabilities:a`.
 * Isolation is not "one of the rules" here — it is the failure this feature
 * could cause that nothing else in the product can: one agency's analytics
 * pixel firing on another agency's storefront reads that agency's visitors and
 * reports them to the first agency's account. Repeating it in the
 * `test:tenant-isolation` lane means the assertion is carried by the lane a
 * reviewer opens when they ask "what stops cross-tenant leakage", alongside
 * `tenant-isolation.test.ts` and `code-snippets-tenant-isolation.test.ts`.
 *
 * WHAT IT CAN AND CANNOT SEE
 * ──────────────────────────
 * `selectTrackingForRender` is the last gate before the DOM: the storefront
 * injector (`components/integrations/tenant-tracking.tsx`) renders its output
 * and nothing else, and is itself mounted only behind the root layout's
 * `publicScope` — non-null solely for tenant-resolved storefront requests. So
 * these tests prove the APPLICATION-layer half exhaustively. The storage layer
 * has no cross-tenant surface to test: the config lives in the owning tenant's
 * own `agencies.settings` row, read by `loadTenantTracking` pinned to a single
 * id and returned WITH that id (`OwnedTrackingConfig`), which is exactly the
 * value the selector compares against here.
 *
 * LANE
 * ────
 * `npm run test:tenant-isolation` (registered explicitly in package.json — a
 * test in no lane never runs).
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  selectTrackingForRender,
  type OwnedTrackingConfig,
  type TenantTrackingConfig,
} from "@/lib/site-admin/tracking";

const AGENCY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENCY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HUB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function configOf(tenantId: string, providers: TenantTrackingConfig): OwnedTrackingConfig {
  return { tenantId, providers };
}

const A_FULL: TenantTrackingConfig = {
  ga4: "G-AAAA111111",
  gtm: "GTM-AAAA111",
  metaPixel: "111111111111111",
  plausible: "agency-a.com",
};

test("the render path emits only the requested tenant's connected accounts", () => {
  const forA = selectTrackingForRender(configOf(AGENCY_A, A_FULL), { tenantId: AGENCY_A });
  assert.deepEqual(
    [...new Set(forA.tags.map((tag) => tag.provider))],
    ["ga4", "gtm", "metaPixel", "plausible"],
  );
  assert.deepEqual(forA.dropped, { otherTenant: 0, invalid: 0 });

  const blob = forA.tags.map((tag) => `${tag.src ?? ""}${tag.code ?? ""}`).join("\n");
  assert.match(blob, /G-AAAA111111/);
  assert.match(blob, /GTM-AAAA111/);
});

test("no tracker of tenant A is ever emitted while rendering tenant B", () => {
  // The read path hands the selector A's OWNED config (e.g. via a cache-key bug
  // or a caller passing the wrong row). The selector must refuse it wholesale.
  const out = selectTrackingForRender(configOf(AGENCY_A, A_FULL), { tenantId: AGENCY_B });
  const blob = out.tags.map((tag) => `${tag.src ?? ""}${tag.code ?? ""}`).join("\n");
  assert.equal(/G-AAAA111111|GTM-AAAA111|111111111111111|agency-a\.com/.test(blob), false);
  assert.deepEqual(out.tags, []);
  assert.equal(out.dropped.otherTenant, 4);
});

test("the platform hub emits no tenant's trackers", () => {
  const out = selectTrackingForRender(configOf(AGENCY_A, A_FULL), { tenantId: HUB });
  assert.deepEqual(out.tags, []);
  assert.equal(out.dropped.otherTenant, 4);
});

test("an unresolved tenant emits nothing — fails closed, never open", () => {
  // A request whose tenant could not be resolved is not a tenant storefront.
  for (const tenantId of ["", "   ".trim()]) {
    const out = selectTrackingForRender(configOf(AGENCY_A, A_FULL), { tenantId });
    assert.deepEqual(out.tags, []);
    assert.equal(out.dropped.otherTenant, 4);
  }
  // And the mirror image: a config whose OWNER is unresolved must not attach
  // itself to whichever tenant happens to be rendering.
  const orphan = selectTrackingForRender(configOf("", A_FULL), { tenantId: AGENCY_A });
  assert.deepEqual(orphan.tags, []);
});

test("a forged tenant id that merely LOOKS like the owner's does not match", () => {
  for (const nearMiss of [
    AGENCY_A.toUpperCase(),
    `${AGENCY_A} `,
    ` ${AGENCY_A}`,
    AGENCY_A.slice(0, -1),
    `${AGENCY_A}x`,
  ]) {
    const out = selectTrackingForRender(configOf(AGENCY_A, A_FULL), { tenantId: nearMiss });
    assert.deepEqual(out.tags, [], `matched on ${JSON.stringify(nearMiss)}`);
  }
});

test("a provider nobody connected emits nothing", () => {
  const out = selectTrackingForRender(
    configOf(AGENCY_A, { ga4: "G-AAAA111111" }),
    { tenantId: AGENCY_A },
  );
  assert.deepEqual([...new Set(out.tags.map((tag) => tag.provider))], ["ga4"]);
  const blob = out.tags.map((tag) => `${tag.src ?? ""}${tag.code ?? ""}`).join("\n");
  assert.equal(/fbq|plausible|gtm\.js/.test(blob), false);

  const empty = selectTrackingForRender(configOf(AGENCY_A, {}), { tenantId: AGENCY_A });
  assert.deepEqual(empty.tags, []);
  assert.deepEqual(empty.dropped, { otherTenant: 0, invalid: 0 });
});

test("a stored value that fails validation is dropped rather than rendered", () => {
  // Storage is not trust: a value written by hand, by a bug, or by an older,
  // looser build must not become markup on the live site.
  const out = selectTrackingForRender(
    configOf(AGENCY_A, {
      ga4: "G-AAAA111111",
      gtm: "'};document.location='https://evil.test';//",
      metaPixel: "</script><script>alert(1)</script>",
    }),
    { tenantId: AGENCY_A },
  );
  assert.deepEqual([...new Set(out.tags.map((tag) => tag.provider))], ["ga4"]);
  assert.equal(out.dropped.invalid, 2);
  const blob = out.tags.map((tag) => `${tag.src ?? ""}${tag.code ?? ""}`).join("\n");
  assert.equal(/evil\.test|alert\(1\)/.test(blob), false);
});
