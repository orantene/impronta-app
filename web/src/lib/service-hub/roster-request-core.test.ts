import assert from "node:assert/strict";
import test from "node:test";

import { buildRosterRequestWith, type RosterRequestDeps } from "./roster-request-core";
import type { RosterServiceItem } from "./roster-services";

const item = (over: Partial<RosterServiceItem> = {}): RosterServiceItem => ({
  listingId: "L1", offeringId: "OFFER-SECRET", title: "Private chef", talentProfileId: "TALENT-SECRET", talentName: "Rafa",
  priceCents: 150000, priceIsFrom: false, currency: "MXN", bookingType: "request", clientContact: "workspace", ...over,
});

function deps(over: Partial<RosterRequestDeps> & { kind?: string; tenantId?: string | null } = {}) {
  const loaded: string[] = [];
  const d: RosterRequestDeps = {
    rateLimitOk: async () => true,
    host: async () => ({ kind: over.kind ?? "agency", tenantId: over.tenantId === undefined ? "tenant-A" : over.tenantId }),
    loadItems: async (t) => (loaded.push(t), [item()]),
    replyLocale: () => "en",
    ...over,
  };
  return { d, loaded };
}

const ASK = { sentence: "private chef for 10 people Saturday" };

test("an agency workspace host builds one request from its OWN roster", async () => {
  const { d, loaded } = deps();
  const res = await buildRosterRequestWith(d, ASK);
  assert.equal(res.ok, true);
  assert.deepEqual(loaded, ["tenant-A"], "the host's tenant, nothing else");
  if (res.ok) assert.match(res.href, /^\/contact\?/);
});

test("NON-agency hosts get nothing and never read a roster: hub, talent site, platform app, marketing, unknown", async () => {
  for (const kind of ["hub", "talent", "app", "marketing", "platform", "unknown", ""]) {
    const { d, loaded } = deps({ kind });
    assert.deepEqual(await buildRosterRequestWith(d, ASK), { ok: false, error: "not_available" }, kind);
    assert.deepEqual(loaded, [], `${kind}: no roster read`);
  }
});

test("an agency host that resolved no tenant is not available (fail closed)", async () => {
  for (const tenantId of [null, ""]) {
    const { d, loaded } = deps({ tenantId });
    assert.deepEqual(await buildRosterRequestWith(d, ASK), { ok: false, error: "not_available" });
    assert.deepEqual(loaded, []);
  }
});

test("a tenant id or talent in the CLIENT input is ignored: the tenant only ever comes from the host", async () => {
  const { d, loaded } = deps();
  await buildRosterRequestWith(d, { ...ASK, tenantId: "tenant-EVIL", talentProfileId: "x" } as never);
  assert.deepEqual(loaded, ["tenant-A"]);
});

test("rate limited, invalid input, unreadable roster, empty roster and no match all say so and build nothing", async () => {
  assert.deepEqual(await buildRosterRequestWith(deps({ rateLimitOk: async () => false }).d, ASK), { ok: false, error: "rate_limited" });
  assert.deepEqual(await buildRosterRequestWith(deps().d, { sentence: "   " }), { ok: false, error: "invalid" });
  assert.deepEqual(await buildRosterRequestWith(deps().d, { sentence: "x".repeat(2000) }), { ok: false, error: "invalid" });
  assert.deepEqual(await buildRosterRequestWith(deps({ loadItems: async () => null }).d, ASK), { ok: false, error: "unavailable" });
  assert.deepEqual(await buildRosterRequestWith(deps({ loadItems: async () => [] }).d, ASK), { ok: false, error: "no_match" });
  assert.deepEqual(await buildRosterRequestWith(deps().d, { sentence: "zzz qqq" }), { ok: false, error: "no_match" });
});

test("a throwing dependency is 'unavailable', never an exception to the visitor", async () => {
  assert.deepEqual(await buildRosterRequestWith(deps({ host: async () => { throw new Error("x"); } }).d, ASK), { ok: false, error: "unavailable" });
});

test("the result never carries a talent or offering id (request-only, no money)", async () => {
  const res = await buildRosterRequestWith(deps().d, ASK);
  assert.doesNotMatch(JSON.stringify(res), /TALENT-SECRET|OFFER-SECRET/);
});
