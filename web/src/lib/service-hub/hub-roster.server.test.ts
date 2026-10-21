/**
 * TUL-1599: the combined reader behind the Services widget, the catalog API, the guest dock and
 * the front-door request. Entries first, the loose rows they contain dropped, queue rows kept.
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { readFileSync } from "node:fs";

import { loadRosterServicesWithHub } from "./hub-roster.server";
import { _resetRosterSellableCacheForTests } from "./roster-services";

beforeEach(() => _resetRosterSellableCacheForTests());

type Row = Record<string, unknown>;
const T = "tenant-1";

function fakeDb(tables: Record<string, Row[]>, opts: { failTable?: string } = {}) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q,
        eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
        in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
        neq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve(opts.failTable === table ? { data: null, error: { code: "XX000", message: "boom" } } : { data: rows, error: null }).then(res),
      });
      return q;
    },
    // The batch sellable RPC (TUL-1475) answers with the sellable listing ids; every listing here is sellable.
    rpc: async (_name: string, args: { p_listing_ids?: string[] }) => ({ data: args?.p_listing_ids ?? true, error: null }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  } as never;
}

const listing = (id: string, entryId: string | null): Row => ({
  id, tenant_id: T, talent_profile_id: `p-${id}`, offering_id: `o-${id}`, status: "accepted", price_mode: "talent_price", margin_bps: null, price_cents: null,
  currency: "USD", show_who: "name", client_contact: "workspace", booking_type: "request", entry_id: entryId, owner_skipped_at: null, created_at: "2026-10-01",
});
const world = (): Record<string, Row[]> => ({
  workspace_service_entries: [{ id: "e1", tenant_id: T, name: "Massage", category: null, photo_media_id: null, hub_price_cents: null, currency: "USD", show_who: "name", featured: false, hidden: false, own_offering_id: null }],
  workspace_service_listings: [listing("a", "e1"), listing("q", null)],
  talent_offerings: ["a", "q"].map((k) => ({ id: `o-${k}`, talent_profile_id: `p-${k}`, title: k === "a" ? "Massage" : "Facial", category: "x", amount_cents: 1000, currency: "USD", status: "published", moderation_state: "approved", visibility: "public" })),
  talent_profiles: ["a", "q"].map((k) => ({ id: `p-${k}`, display_name: k === "a" ? "Ana" : "Quin", deleted_at: null, is_publicly_hidden: false, is_publicly_listed: true, visibility: "public", profile_kind: "talent" })),
  agency_talent_roster: ["a", "q"].map((k) => ({ tenant_id: T, talent_profile_id: `p-${k}`, status: "active" })),
});

test("the entry shows, its member's loose row is dropped, and the queued listing stays loose", async () => {
  const out = await loadRosterServicesWithHub(fakeDb(world()), T);
  assert.deepEqual(out.map((i) => i.listingId), ["entry_e1", "q"]);
  assert.equal(out[0].bookingType, "request");
  assert.equal(out[0].talentProfileId, null);
});

test("an unreadable entries read keeps today's behaviour (every loose row)", async () => {
  const out = await loadRosterServicesWithHub(fakeDb(world(), { failTable: "workspace_service_entries" }), T);
  assert.deepEqual(out.map((i) => i.listingId).sort(), ["a", "q"]);
});

test("the four public surfaces read through the combined loader, not the loose reader", () => {
  for (const f of [
    "src/components/home/homepage-cms-data-sources.ts",
    "src/app/api/public/booking/business-catalog/route.ts",
    "src/lib/messages-v5/items-catalog.ts",
    "src/lib/server-actions/roster-request.ts",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /loadRosterServicesWithHub\(/, f);
    assert.doesNotMatch(src, /loadWorkspaceRosterServices\(/, f);
  }
});
