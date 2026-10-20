import assert from "node:assert/strict";
import test from "node:test";

import { loadPublicHubEntries } from "./public-hub.server";

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>, opts: { sellable?: Record<string, boolean | "error">; failTable?: string } = {}) {
  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const filters: Array<(r: Row) => boolean> = [];
    const b: Record<string, unknown> = {};
    const run = () => (opts.failTable === table ? { data: null, error: { code: "XX000", message: "boom" } } : { data: rows.filter((r) => filters.every((f) => f(r))), error: null });
    b.select = () => b;
    b.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), b);
    b.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b);
    b.order = () => b;
    b.maybeSingle = async () => ({ data: run().data?.[0] ?? null, error: null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok);
    return b;
  };
  const rpc = async (fn: string, args: { p_listing_id: string }) => {
    if (fn !== "workspace_service_listing_is_sellable") return { data: null, error: { message: "nope" } };
    const v = opts.sellable?.[args.p_listing_id];
    if (v === "error") return { data: null, error: { code: "42883", message: "missing" } };
    return { data: v === true, error: null };
  };
  return { from, rpc, storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } } as never;
}

const T = "tenant-1";
const entry = (id: string, over: Row = {}): Row => ({ id, tenant_id: T, name: `Entry ${id}`, category: null, photo_media_id: null, hub_price_cents: null, currency: "USD", show_who: "name", featured: false, hidden: false, own_offering_id: null, ...over });
const listing = (id: string, entryId: string, over: Row = {}): Row => ({ id, tenant_id: T, talent_profile_id: `p-${id}`, offering_id: `o-${id}`, status: "accepted", price_mode: "talent_price", booking_type: "instant", currency: "USD", entry_id: entryId, owner_skipped_at: null, ...over });
const base = () => ({
  workspace_service_entries: [entry("e1")],
  workspace_service_listings: [listing("a", "e1")],
  talent_offerings: [{ id: "o-a", title: "Massage", category: "massage", duration_minutes: 60, amount_cents: 50000, currency: "USD" }],
  talent_profiles: [{ id: "p-a", display_name: "Ana" }],
  talent_offering_media: [{ offering_id: "o-a", sort_order: 0, media_asset_id: "m1", media_assets: { public_url: "https://img/m1.jpg", bucket_id: null, storage_path: null } }],
});

test("a sellable member's entry is shown, request-only, with its photo and name", async () => {
  const out = await loadPublicHubEntries(fakeDb(base(), { sellable: { a: true } }), T);
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].cta, out[0].who, out[0].photoUrl, out[0].priceCents], ["request", ["Ana"], "https://img/m1.jpg", 50000]);
});

test("not sellable, or the sellable check errors or is missing: nothing shown (fail closed)", async () => {
  assert.equal((await loadPublicHubEntries(fakeDb(base(), { sellable: { a: false } }), T)).length, 0);
  assert.equal((await loadPublicHubEntries(fakeDb(base(), { sellable: { a: "error" } }), T)).length, 0);
  assert.equal((await loadPublicHubEntries(fakeDb(base(), {}), T)).length, 0);
});

test("another workspace's entries and a talent who has not accepted are never shown", async () => {
  const t = base();
  t.workspace_service_entries = [entry("e1"), { ...entry("x"), tenant_id: "other" }];
  t.workspace_service_listings = [listing("a", "e1"), listing("b", "e1", { status: "offered" }), { ...listing("c", "x"), tenant_id: "other" }];
  const out = await loadPublicHubEntries(fakeDb(t, { sellable: { a: true, b: true, c: true } }), T);
  assert.deepEqual(out.map((e) => e.id), ["e1"]);
  assert.deepEqual(out[0].who, ["Ana"]);
});

test("a hidden entry is not shown; an unreadable table shows nothing", async () => {
  const t = base();
  t.workspace_service_entries = [entry("e1", { hidden: true })];
  assert.equal((await loadPublicHubEntries(fakeDb(t, { sellable: { a: true } }), T)).length, 0);
  assert.equal((await loadPublicHubEntries(fakeDb(base(), { sellable: { a: true }, failTable: "workspace_service_entries" }), T)).length, 0);
  assert.equal((await loadPublicHubEntries(fakeDb(base(), { sellable: { a: true }, failTable: "workspace_service_listings" }), T)).length, 0);
});

test("a chosen photo that is not one of the entry's own is ignored", async () => {
  const t = base();
  t.workspace_service_entries = [entry("e1", { photo_media_id: "foreign" })];
  const out = await loadPublicHubEntries(fakeDb(t, { sellable: { a: true } }), T);
  assert.equal(out[0].photoUrl, "https://img/m1.jpg");
});
