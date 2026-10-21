import assert from "node:assert/strict";
import test from "node:test";

import { HUB_LISTING_CATALOG_ENTRIES } from "./catalog-entries-hub-listing";
import { breachedListings, notifyListingsBelowMinimum } from "./producers/listing-below-minimum-notify";

const entry = HUB_LISTING_CATALOG_ENTRIES[0]!;
const ev = (payload: Record<string, unknown>) => ({ payload } as never);

test("the bell reads in both languages, names who and what, and has no email", () => {
  assert.equal(entry.defaultChannels.join(), "in_app");
  assert.equal(entry.email, undefined);
  assert.deepEqual(entry.triggers, ["hub.listing_below_minimum"]);
  const t = entry.in_app!.title;
  assert.equal(t(ev({ talentName: "Ana", serviceTitle: "Masaje" }), { locale: "es" } as never), "Ana subió el precio de Masaje");
  assert.equal(t(ev({ talentName: "Ana", serviceTitle: "Massage" }), { locale: "en" } as never), "Ana raised the price of Massage");
  assert.equal(t(ev({}), { locale: "en" } as never), "Someone on your team raised the price of a service");
  const b = entry.in_app!.body;
  for (const l of ["es", "en"]) assert.doesNotMatch(String(b(ev({}), { locale: l } as never)), /[—–_]/);
});

test("only a listing the database stamped as breached counts", () => {
  assert.deepEqual(
    breachedListings([
      { id: "L1", tenant_id: "T1", floor_breached_at: "2026-10-20T10:00:00Z" },
      { id: "L2", tenant_id: "T1", floor_breached_at: null },
      { id: "L3", tenant_id: null, floor_breached_at: "x" },
      { id: 4, tenant_id: "T1", floor_breached_at: "x" },
    ]),
    [{ id: "L1", tenantId: "T1", breachedAt: "2026-10-20T10:00:00Z" }],
  );
});

function fakeAdmin(rows: unknown[], err: { code?: string } | null = null) {
  const q: Record<string, unknown> = {};
  q.select = () => q; q.eq = () => q; q.not = () => q;
  q.maybeSingle = async () => ({ data: { display_name: "Ana", slug: "blue" }, error: null });
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: err }).then(ok);
  return { from: () => q } as never;
}

test("nothing breached, a missing table or a failed read notifies nobody and never throws", async () => {
  assert.equal(await notifyListingsBelowMinimum({ admin: fakeAdmin([]), offeringId: "o", talentProfileId: "p", serviceTitle: "x" }), 0);
  assert.equal(await notifyListingsBelowMinimum({ admin: fakeAdmin([], { code: "42P01" }), offeringId: "o", talentProfileId: "p", serviceTitle: "x" }), 0);
  assert.equal(await notifyListingsBelowMinimum({ admin: fakeAdmin([], { code: "XX000" }), offeringId: "o", talentProfileId: "p", serviceTitle: "x" }), 0);
});

test("one bell per breached listing", async () => {
  const n = await notifyListingsBelowMinimum({
    admin: fakeAdmin([{ id: "L1", tenant_id: "T1", floor_breached_at: "a" }, { id: "L2", tenant_id: "T2", floor_breached_at: "b" }]),
    offeringId: "o", talentProfileId: "p", serviceTitle: "x",
  });
  assert.equal(n, 2);
});
