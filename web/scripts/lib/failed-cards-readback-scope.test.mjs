import assert from "node:assert/strict";
import { test } from "node:test";

import { READBACK_CHECKS } from "./failed-cards-readback.mjs";
import { DEPENDS, buildPlan, resolveFixtures } from "./failed-cards-plan.mjs";
import { F3_DOMAIN_KEYS, F3_ROSTER_KEYS, F3_STUDIO_SERVICE_KEYS } from "./failed-cards-plan-sites.mjs";
import { fcId } from "./failed-cards-guards.mjs";

const payload = { shellTree: [], homeTree: [{ id: "c", kind: "container", props: {}, children: [{ id: "h", kind: "heading", props: { text: "{{displayName}}" } }] }] };
const ctx = { now: new Date("2026-10-21T12:00:00Z"), trees: { shell: () => [], home: () => [] }, templatePayload: payload, housekeepingTermId: "243452c3-01ac-b167-ca0a-5101a29724b2" };
const allOps = () => buildPlan(resolveFixtures(null), ctx);
const onlyF3 = () => buildPlan(resolveFixtures(["F3"]), ctx);

/** Read-backs that legitimately count a whole keyed scope, each with the reason it cannot be moved by another cluster. */
const TENANT_SCOPE_EXEMPT = [
  [/logo \+ accent/, "agency_branding is one row per tenant (its primary key), only F3 writes it"],
  [/concierge:/, "the F14 workspace is written only by F14"],
  [/second staff login/, "also pinned by profile_id: it counts one membership"],
  [/reservations: a dinner window/, "scoped to G7's own venue id"],
];
const BARE_SCOPE = /\b(?:\w+\.)?(tenant_id|venue_id)\s*=\s*\$\d/;

const closure = (fx) => {
  const seen = new Set([fx]);
  for (const f of seen) for (const d of DEPENDS[f] ?? []) seen.add(d);
  return seen;
};
const uuidish = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

test("no read-back counts a whole tenant / venue unless it is exempt for a stated reason", () => {
  let checked = 0;
  for (const [fx, checks] of Object.entries(READBACK_CHECKS)) {
    for (const [label, sql] of checks) {
      checked += 1;
      if (!BARE_SCOPE.test(sql)) continue;
      const ex = TENANT_SCOPE_EXEMPT.find(([re]) => re.test(label));
      assert.ok(ex, `${fx} "${label}" counts by tenant/venue: scope it to this cluster's own ids (or exempt it with a reason)`);
    }
  }
  assert.ok(checked > 40);
});

test("every id a read-back names belongs to its own cluster or to a cluster it depends on", () => {
  const owner = new Map();
  for (const op of allOps()) if (op.id && ["insert", "clone", "authUser"].includes(op.kind)) owner.set(op.id, op.fx);
  let named = 0;
  for (const [fx, checks] of Object.entries(READBACK_CHECKS)) {
    const ok = closure(fx);
    for (const [label, , params] of checks) {
      for (const p of params.flat()) {
        if (!uuidish(p) || !owner.has(p)) continue;
        named += 1;
        assert.ok(ok.has(owner.get(p)), `${fx} "${label}" names a ${owner.get(p)} row`);
      }
    }
  }
  assert.ok(named > 50);
});

test("F3's expected counts are derived from F3's own plan keys, with every cluster in the plan", () => {
  const all = allOps();
  const f3 = onlyF3();
  const f3Checks = READBACK_CHECKS.F3;
  const find = (re) => f3Checks.find(([l]) => re.test(l));
  // the services check
  const [, sql, params, want] = find(/published priced services with a photo/);
  assert.match(sql, /o\.id = any\(\$1::uuid\[\]\)/, "counts by id, not by tenant");
  assert.equal(want, params[0].length, "expected = the id list length");
  assert.equal(want, F3_STUDIO_SERVICE_KEYS.length);
  const studio = f3.find((o) => o.key === "workspace:f3").id;
  const mediaLinked = (ops) => new Set(ops.filter((o) => o.table === "public.talent_offering_media").map((o) => o.row.offering_id));
  const ownPricedWithPhoto = (ops) => ops.filter((o) => o.fx === "F3" && o.table === "public.talent_offerings" && o.row.tenant_id === studio && o.row.status === "published" && o.row.amount_cents > 0 && mediaLinked(ops).has(o.id)).map((o) => o.id);
  assert.equal(ownPricedWithPhoto(f3).length, want);
  assert.equal(ownPricedWithPhoto(all).length, want, "adding F+G clusters does not change F3's own count");
  assert.deepEqual([...ownPricedWithPhoto(all)].sort(), [...params[0]].sort(), "the id list is exactly F3's own priced services");
  // the bug: counting the tenant instead would see G8's service too
  const tenantWide = (ops) => ops.filter((o) => o.table === "public.talent_offerings" && o.row.tenant_id === studio && o.row.status === "published" && o.row.amount_cents > 0 && mediaLinked(ops).has(o.id)).length;
  assert.equal(tenantWide(f3), want);
  assert.ok(tenantWide(all) > want, "a tenant-wide count moves once G8 exists (the stale assertion that failed the selftest)");
  // roster and domains
  const [, , rp, rw] = find(/2 site-visible roster talents/);
  assert.deepEqual(rp[0], F3_ROSTER_KEYS.map(fcId));
  assert.equal(rw, rp[0].length);
  const [, , dp, dw] = find(/subdomain \(active\) \+ custom domain/);
  assert.deepEqual(dp[0], F3_DOMAIN_KEYS.map(fcId));
  assert.equal(dw, dp[0].length);
  for (const id of [...rp[0], ...dp[0], ...params[0]]) assert.ok(f3.some((o) => o.id === id), `${id} is an F3 op`);
});

test("a synthetic extra row in the F3 studio changes no cluster's expected count", () => {
  const all = allOps();
  const studio = all.find((o) => o.key === "workspace:f3").id;
  const wantsBefore = JSON.stringify(Object.fromEntries(Object.entries(READBACK_CHECKS).map(([fx, cs]) => [fx, cs.map((c) => c[3])])));
  const extra = [
    { fx: "ZZ", kind: "insert", table: "public.talent_offerings", key: "offering:zz-extra", id: fcId("offering:zz-extra"), row: { id: fcId("offering:zz-extra"), tenant_id: studio, status: "published", amount_cents: 99900, duration_minutes: 60, owner_kind: "workspace" } },
    { fx: "ZZ", kind: "insert", table: "public.talent_offering_media", key: "om:zz", id: null, row: { offering_id: fcId("offering:zz-extra"), media_asset_id: fcId("media:f3-a-estandar") } },
  ];
  const withExtra = [...all, ...extra];
  const ids = new Set(withExtra.filter((o) => o.id).map((o) => o.id));
  // every id list in every read-back is untouched by the extra row, so the expected numbers are the same by construction
  for (const checks of Object.values(READBACK_CHECKS)) for (const [, , params, want] of checks) {
    for (const arr of params.filter(Array.isArray)) {
      assert.equal(arr.includes(fcId("offering:zz-extra")), false);
      assert.ok(arr.length <= want || want >= 1);
    }
  }
  assert.ok(ids.has(fcId("offering:zz-extra")));
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(READBACK_CHECKS).map(([fx, cs]) => [fx, cs.map((c) => c[3])]))), wantsBefore);
  // and the only tenant-wide read-backs left are the exempt, single-writer ones
  const bare = Object.entries(READBACK_CHECKS).flatMap(([fx, cs]) => cs.filter(([, sql]) => BARE_SCOPE.test(sql)).map(([l]) => `${fx} ${l}`));
  assert.ok(bare.length <= TENANT_SCOPE_EXEMPT.length, bare.join("; "));
});
