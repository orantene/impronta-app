import assert from "node:assert/strict";
import test from "node:test";

import { loadPublicHub, loadPublicHubEntries } from "./public-hub.server";

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
const PUBLIC_TALENT = (id: string, over: Row = {}): Row => ({ id: `p-${id}`, display_name: id === "a" ? "Ana" : `T ${id}`, deleted_at: null, is_publicly_hidden: false, is_publicly_listed: true, visibility: "public", profile_kind: "talent", ...over });
const base = (): Record<string, Row[]> => ({
  workspace_service_entries: [entry("e1")],
  workspace_service_listings: [listing("a", "e1")],
  talent_offerings: [{ id: "o-a", title: "Massage", category: "massage", duration_minutes: 60, amount_cents: 50000, currency: "USD", status: "published", moderation_state: "approved", visibility: "public" }],
  talent_profiles: [PUBLIC_TALENT("a")],
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

test("a hidden entry shows no member photo and no names", async () => {
  const t = base();
  t.workspace_service_entries = [entry("e1", { show_who: "hidden" })];
  const out = await loadPublicHubEntries(fakeDb(t, { sellable: { a: true } }), T);
  assert.equal(out.length, 1);
  assert.equal(out[0].photoUrl, null);
  assert.deepEqual(out[0].who, []);
});

test("a hidden entry backed by the workspace's own service still shows that service's image", async () => {
  const t = base();
  t.workspace_service_entries = [entry("e1", { show_who: "hidden", own_offering_id: "own-1" })];
  t.workspace_service_listings = [];
  t.talent_offerings = [{ id: "own-1", tenant_id: T, status: "published", moderation_state: "approved", visibility: "public" }];
  t.talent_offering_media = [{ offering_id: "own-1", sort_order: 0, media_asset_id: "mo", media_assets: { public_url: "https://img/own.jpg", bucket_id: null, storage_path: null } }];
  const out = await loadPublicHubEntries(fakeDb(t, {}), T);
  assert.equal(out[0].photoUrl, "https://img/own.jpg");
});

test("a soft-deleted, hidden, unlisted or non-public talent's services and photos never appear", async () => {
  for (const flags of [{ deleted_at: "2026-10-01" }, { is_publicly_hidden: true }, { is_publicly_hidden: null }, { is_publicly_listed: false }, { visibility: "private" }, { profile_kind: "resource" }]) {
    const t = base();
    t.talent_profiles = [PUBLIC_TALENT("a", flags)];
    const out = await loadPublicHubEntries(fakeDb(t, { sellable: { a: true } }), T);
    assert.equal(out.length, 0, JSON.stringify(flags));
  }
});

test("a member offering that is not published and approved is not shown", async () => {
  for (const flags of [{ status: "draft" }, { moderation_state: "pending" }, { visibility: "private" }]) {
    const t = base();
    t.talent_offerings = [{ ...(t.talent_offerings[0] as Row), ...flags }];
    assert.equal((await loadPublicHubEntries(fakeDb(t, { sellable: { a: true } }), T)).length, 0, JSON.stringify(flags));
  }
});

test("an unreadable profile or offering check shows nothing", async () => {
  assert.equal((await loadPublicHubEntries(fakeDb(base(), { sellable: { a: true }, failTable: "talent_profiles" }), T)).length, 0);
  assert.equal((await loadPublicHubEntries(fakeDb(base(), { sellable: { a: true }, failTable: "talent_offerings" }), T)).length, 0);
});

test("the database check runs only for listings that passed the cheap checks", async () => {
  const t = base();
  t.workspace_service_listings = [listing("a", "e1"), listing("b", "e1")];
  t.talent_profiles = [PUBLIC_TALENT("a"), PUBLIC_TALENT("b", { is_publicly_hidden: true })];
  t.talent_offerings = [
    { id: "o-a", title: "x", amount_cents: 100, currency: "USD", status: "published", moderation_state: "approved", visibility: "public" },
    { id: "o-b", title: "x", amount_cents: 100, currency: "USD", status: "published", moderation_state: "approved", visibility: "public" },
  ];
  const calls: string[] = [];
  const db = fakeDb(t, { sellable: { a: true, b: true } }) as unknown as { rpc: (fn: string, a: { p_listing_id: string }) => Promise<unknown> };
  const orig = db.rpc;
  db.rpc = async (fn, a) => (calls.push(a.p_listing_id), orig(fn, a));
  await loadPublicHubEntries(db as never, T);
  assert.deepEqual(calls, ["a"]);
});

test("TUL-1599: covered ids are the sellable members of shown entries; queue and hidden-entry listings stay loose", async () => {
  const t = base();
  t.workspace_service_entries = [entry("e1"), entry("e2", { hidden: true })];
  t.workspace_service_listings = [listing("a", "e1"), listing("b", "e1"), listing("q", null as never), listing("h", "e2")];
  t.talent_offerings = ["a", "b", "q", "h"].map((k) => ({ id: `o-${k}`, title: k, category: "x", duration_minutes: 60, amount_cents: 1000, currency: "USD", status: "published", moderation_state: "approved", visibility: "public" }));
  t.talent_profiles = ["a", "b", "q", "h"].map((k) => PUBLIC_TALENT(k));
  const hub = await loadPublicHub(fakeDb(t, { sellable: { a: true, b: false, q: true, h: true } }), T);
  assert.deepEqual(hub.entries.map((e) => e.id), ["e1"]);
  assert.deepEqual([...hub.coveredListingIds].sort(), ["a"]);
});

test("TUL-1599: an unreadable read covers nothing", async () => {
  const hub = await loadPublicHub(fakeDb(base(), { sellable: { a: true }, failTable: "talent_profiles" }), T);
  assert.deepEqual([hub.entries.length, hub.coveredListingIds.size], [0, 0]);
});

test("TUL-1599 (D-10a): an on-request member contributes no price; public members still do", async () => {
  const t = base();
  t.workspace_service_listings = [listing("a", "e1", { price_cents: 50000 }), listing("b", "e1", { price_cents: 30000 })];
  t.talent_offerings = [
    { id: "o-a", amount_cents: 50000, currency: "USD", status: "published", moderation_state: "approved", visibility: "on_request" },
    { id: "o-b", amount_cents: 30000, currency: "USD", status: "published", moderation_state: "approved", visibility: "public" },
  ];
  t.talent_profiles = [PUBLIC_TALENT("a"), PUBLIC_TALENT("b")];
  const out = await loadPublicHubEntries(fakeDb(t, { sellable: { a: true, b: true } }), T);
  assert.deepEqual([out[0].priceCents, out[0].from], [30000, true]);
  const only = base();
  only.talent_offerings = [{ id: "o-a", amount_cents: 50000, currency: "USD", status: "published", moderation_state: "approved", visibility: "on_request" }];
  const none = await loadPublicHubEntries(fakeDb(only, { sellable: { a: true } }), T);
  assert.equal(none[0].priceCents, null);
});
