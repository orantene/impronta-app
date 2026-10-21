import assert from "node:assert/strict";
import { test } from "node:test";

import { setOfferingComponents } from "@/lib/catalog/packages";
import { upsertSessionSeries } from "@/lib/sessions/series-write";
import { sessionSetInstructor } from "@/lib/sessions/session-ops";
import { readPackageSelectorCore } from "@/lib/storefront/package-selector.core";
import { admissionComp } from "@/lib/venues/event-holds";
import { partyWaitlistJoin } from "@/lib/venues/party-waitlist";
import { assertIdsBelongToTenant, assertUserIsTenantStaff, assertVariantsBelongToTenant } from "./tenant-owned-ids";

// TUL-1517: every writer that accepts an id proves the id belongs to the caller's tenant, and a
// FOREIGN-tenant id is a refusal that writes nothing.

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWN = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const FOREIGN = (n: number) => `ffffffff-ffff-4fff-8fff-ffffffff000${n}`;

type Row = Record<string, unknown>;

/** In-memory PostgREST fake: honours `.eq` / `.in` filters, records every write and RPC. */
function makeAdmin(tables: Record<string, Row[]>) {
  const writes: string[] = [];
  const rpcs: string[] = [];
  function builder(table: string) {
    const eqs: Array<[string, unknown]> = [];
    let ins: [string, unknown[]] | null = null;
    let isWrite: string | null = null;
    const rows = () =>
      (tables[table] ?? []).filter(
        (r) => eqs.every(([c, v]) => r[c] === v) && (!ins || ins[1].includes(r[ins[0]])),
      );
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (c: string, v: unknown) => (eqs.push([c, v]), b),
      in: (c: string, v: unknown[]) => ((ins = [c, v]), b),
      limit: () => b,
      is: () => b,
      order: () => b,
      delete: () => ((isWrite = `delete:${table}`), writes.push(isWrite), b),
      insert: () => ((isWrite = `insert:${table}`), writes.push(isWrite), b),
      update: () => ((isWrite = `update:${table}`), writes.push(isWrite), b),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: isWrite ? null : rows(), error: null }),
    };
    return b;
  }
  return {
    writes,
    rpcs,
    from: (t: string) => builder(t),
    rpc: async (fn: string) => {
      rpcs.push(fn);
      return { data: { ok: true, id: "x" }, error: null };
    },
  };
}

const world = () => ({
  talent_offerings: [
    { id: OWN(1), tenant_id: A, title: "Own pkg" },
    { id: OWN(2), tenant_id: A, title: "Own comp" },
    { id: FOREIGN(1), tenant_id: B, title: "Foreign" },
  ],
  talent_offering_variants: [
    { id: OWN(3), offering_id: OWN(1) },
    { id: FOREIGN(2), offering_id: FOREIGN(1) },
  ],
  venues: [
    { id: OWN(4), tenant_id: A },
    { id: FOREIGN(3), tenant_id: B },
  ],
  venue_locations: [
    { id: OWN(5), tenant_id: A },
    { id: FOREIGN(4), tenant_id: B },
  ],
  venue_location_zones: [
    { id: OWN(6), tenant_id: A },
    { id: FOREIGN(5), tenant_id: B },
  ],
  agency_memberships: [
    { id: "m1", tenant_id: A, profile_id: OWN(7), status: "active" },
    { id: "m2", tenant_id: B, profile_id: FOREIGN(6), status: "active" },
    { id: "m3", tenant_id: A, profile_id: OWN(8), status: "removed" },
  ],
  talent_profiles: [
    { id: "tp-own", user_id: OWN(9) },
    { id: "tp-foreign", user_id: FOREIGN(7) },
    { id: "tp-inactive", user_id: OWN(3) },
  ],
  agency_talent_roster: [
    { id: "r1", tenant_id: A, talent_profile_id: "tp-own", status: "active" },
    { id: "r2", tenant_id: B, talent_profile_id: "tp-foreign", status: "active" },
    { id: "r3", tenant_id: A, talent_profile_id: "tp-inactive", status: "removed" },
  ],
});

test("helpers: own ids pass, foreign / missing ids refuse, nothing leaks which", async () => {
  const admin = makeAdmin(world());
  assert.deepEqual(await assertIdsBelongToTenant(admin, "talent_offerings", [OWN(1), OWN(2)], A), { ok: true });
  assert.deepEqual(await assertIdsBelongToTenant(admin, "talent_offerings", [OWN(1), FOREIGN(1)], A), { ok: false, reason: "wrong_tenant" });
  assert.deepEqual(await assertIdsBelongToTenant(admin, "talent_offerings", [FOREIGN(9)], A), { ok: false, reason: "wrong_tenant" });
  assert.deepEqual(await assertVariantsBelongToTenant(admin, [OWN(3)], A), { ok: true });
  assert.deepEqual(await assertVariantsBelongToTenant(admin, [FOREIGN(2)], A), { ok: false, reason: "wrong_tenant" });
  assert.deepEqual(await assertUserIsTenantStaff(admin, OWN(7), A), { ok: true });
  assert.deepEqual(await assertUserIsTenantStaff(admin, FOREIGN(6), A), { ok: false, reason: "wrong_tenant" });
  assert.deepEqual(await assertUserIsTenantStaff(admin, OWN(8), A), { ok: false, reason: "wrong_tenant" });
  // roster talent of the tenant may teach; another tenant's talent or an inactive roster row may not
  assert.deepEqual(await assertUserIsTenantStaff(admin, OWN(9), A), { ok: true });
  assert.deepEqual(await assertUserIsTenantStaff(admin, FOREIGN(7), A), { ok: false, reason: "wrong_tenant" });
  assert.deepEqual(await assertUserIsTenantStaff(admin, OWN(3), A), { ok: false, reason: "wrong_tenant" });
});

test("helpers: a failing lookup is unavailable, never a pass", async () => {
  const broken = {
    from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: null, error: { message: "boom" } }) }) }) }),
  };
  assert.deepEqual(await assertIdsBelongToTenant(broken, "venues", [OWN(4)], A), { ok: false, reason: "unavailable" });
});

test("setOfferingComponents refuses a foreign component and deletes/writes nothing", async () => {
  const admin = makeAdmin(world());
  const res = await setOfferingComponents(admin, {
    tenantId: A,
    offeringId: OWN(1),
    components: [{ componentOfferingId: FOREIGN(1), qty: 1, required: true }],
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "not_found");
  assert.deepEqual(admin.writes, []);
});

test("setOfferingComponents refuses a foreign package id too, and still saves own components", async () => {
  const admin = makeAdmin(world());
  const foreignPkg = await setOfferingComponents(admin, {
    tenantId: A,
    offeringId: FOREIGN(1),
    components: [{ componentOfferingId: OWN(2), qty: 1, required: true }],
  });
  assert.equal(foreignPkg.ok, false);
  assert.deepEqual(admin.writes, []);
  const own = await setOfferingComponents(admin, {
    tenantId: A,
    offeringId: OWN(1),
    components: [{ componentOfferingId: OWN(2), qty: 1, required: true }],
  });
  assert.equal(own.ok, true);
  assert.deepEqual(admin.writes, ["delete:offering_components", "insert:offering_components"]);
});

test("package selector never reads a foreign component title", async () => {
  const w = world();
  const tables = {
    ...w,
    offering_components: [{ tenant_id: A, offering_id: OWN(1), component_offering_id: FOREIGN(1), qty: 1, required: true }],
  };
  const admin = makeAdmin(tables);
  const res = await readPackageSelectorCore(
    {
      admin,
      locale: "en",
      livePrice: async () => ({ ok: true, phaseId: null, priceCents: 0 }),
    } as unknown as Parameters<typeof readPackageSelectorCore>[0],
    A,
    {} as Parameters<typeof readPackageSelectorCore>[2],
  );
  // Whatever the read answers, the foreign offering's title must not appear anywhere in it.
  assert.equal(JSON.stringify(res).includes("Foreign"), false);
});

test("admissionComp refuses a foreign tier variant and never calls the RPC", async () => {
  const admin = makeAdmin(world());
  const res = await admissionComp(admin as unknown as Parameters<typeof admissionComp>[0], {
    tenantId: A,
    sessionId: OWN(1),
    tierVariantId: FOREIGN(2),
    holderName: "Guest",
    reason: "vip",
    operationKey: "comp-op-key-1",
  });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "not_found");
  assert.deepEqual(admin.rpcs, []);
});

test("admissionComp lets an own variant reach the RPC", async () => {
  const admin = makeAdmin(world());
  await admissionComp(admin as unknown as Parameters<typeof admissionComp>[0], {
    tenantId: A,
    sessionId: OWN(1),
    tierVariantId: OWN(3),
    holderName: "Guest",
    reason: "vip",
    operationKey: "comp-op-key-1",
  });
  assert.deepEqual(admin.rpcs, ["admission_comp"]);
});

test("partyWaitlistJoin refuses a foreign zone (and a foreign location) and never calls the RPC", async () => {
  const admin = makeAdmin(world());
  const zone = await partyWaitlistJoin(admin as unknown as Parameters<typeof partyWaitlistJoin>[0], {
    tenantId: A,
    locationId: OWN(5),
    zoneId: FOREIGN(5),
    partySize: 2,
    holderName: "Party",
  });
  assert.equal(zone.ok, false);
  if (!zone.ok) assert.equal(zone.reason, "not_found");
  const loc = await partyWaitlistJoin(admin as unknown as Parameters<typeof partyWaitlistJoin>[0], {
    tenantId: A,
    locationId: FOREIGN(4),
    zoneId: OWN(6),
    partySize: 2,
    holderName: "Party",
  });
  assert.equal(loc.ok, false);
  assert.deepEqual(admin.rpcs, []);
  const ok = await partyWaitlistJoin(admin as unknown as Parameters<typeof partyWaitlistJoin>[0], {
    tenantId: A,
    locationId: OWN(5),
    zoneId: OWN(6),
    partySize: 2,
    holderName: "Party",
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(admin.rpcs, ["party_waitlist_join"]);
});

const seriesInput = (over: Partial<Parameters<typeof upsertSessionSeries>[1]>) => ({
  tenantId: A,
  title: "Mat",
  localTime: "10:00",
  timeZone: "UTC",
  weekdays: [1],
  durationMinutes: 60,
  seats: 10,
  startsOn: "2026-10-05",
  venueId: OWN(4),
  instructorUserId: OWN(7),
  ...over,
});

test("upsertSessionSeries refuses a foreign venue, offering or instructor and writes nothing", async () => {
  for (const over of [{ venueId: FOREIGN(3) }, { offeringId: FOREIGN(1) }, { instructorUserId: FOREIGN(6) }]) {
    const admin = makeAdmin(world());
    const res = await upsertSessionSeries(admin, seriesInput(over));
    assert.equal(res.ok, false, JSON.stringify(over));
    if (!res.ok) assert.equal(res.reason, "wrong_tenant");
    assert.deepEqual(admin.writes, [], JSON.stringify(over));
  }
});

test("sessionSetInstructor refuses a foreign instructor and never calls the RPC", async () => {
  const admin = makeAdmin(world());
  const res = await sessionSetInstructor(admin, { tenantId: A, sessionId: OWN(1), userId: FOREIGN(6), scope: "series" });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "wrong_tenant");
  assert.deepEqual(admin.rpcs, []);
  const own = await sessionSetInstructor(admin, { tenantId: A, sessionId: OWN(1), userId: OWN(7), scope: "series" });
  assert.equal(own.ok === true || own.reason !== "wrong_tenant", true);
  assert.deepEqual(admin.rpcs, ["session_set_instructor"]);
});
