import assert from "node:assert/strict";
import test from "node:test";

import { HUB_LISTING_CATALOG_ENTRIES } from "./catalog-entries-hub-listing";
import { notifyListingOffered } from "./producers/listing-offered-notify";

const entry = HUB_LISTING_CATALOG_ENTRIES.find((e) => e.id === "hub.listing_update_offered.talent")!;
const ev = (payload: Record<string, unknown>) => ({ payload } as never);

test("the talent bell reads in both languages, names the workspace and service, has no email", () => {
  assert.ok(entry);
  assert.equal(entry.defaultChannels.join(), "in_app");
  assert.equal(entry.email, undefined);
  assert.deepEqual(entry.triggers, ["hub.listing_update_offered"]);
  assert.equal(entry.in_app!.surface, "talent");
  const t = entry.in_app!.title;
  assert.equal(t(ev({ workspaceName: "Blue Oar", serviceTitle: "Massage" }), { locale: "en" } as never), "Blue Oar updated the terms of Massage");
  assert.equal(t(ev({ workspaceName: "Blue Oar", serviceTitle: "Masaje" }), { locale: "es" } as never), "Blue Oar actualizó las condiciones de Masaje");
  for (const l of ["en", "es"]) assert.doesNotMatch(String(entry.in_app!.body!(ev({}), { locale: l } as never)), /[—–_]/);
});

test("the bell goes to the user on the event (the talent), not the workspace", async () => {
  const aud = await entry.resolveAudience!({ userId: "u1", payload: {} } as never, {} as never);
  assert.deepEqual(aud, [{ kind: "user", userId: "u1", role: "talent" }]);
});

function fakeAdmin(row: unknown, err: { code?: string } | null = null) {
  return {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q; q.eq = () => q;
      q.maybeSingle = async () => ({ data: row, error: err });
      return q;
    },
  } as never;
}

test("no bell for a listing that is not waiting, a missing row, a missing table or a failed read", async () => {
  assert.equal(await notifyListingOffered({ admin: fakeAdmin({ tenant_id: "t", talent_profile_id: "p", status: "accepted" }), listingId: "L" }), false);
  assert.equal(await notifyListingOffered({ admin: fakeAdmin(null), listingId: "L" }), false);
  assert.equal(await notifyListingOffered({ admin: fakeAdmin(null, { code: "42P01" }), listingId: "L" }), false);
  assert.equal(await notifyListingOffered({ admin: fakeAdmin(null, { code: "XX000" }), listingId: "L" }), false);
});

test("no bell when the talent has no account to notify", async () => {
  assert.equal(await notifyListingOffered({ admin: fakeAdmin({ tenant_id: "t", talent_profile_id: "p", status: "offered" }), listingId: "L" }), false);
});
