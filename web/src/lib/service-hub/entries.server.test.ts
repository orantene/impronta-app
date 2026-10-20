import assert from "node:assert/strict";
import test from "node:test";

import { addOwnService, decideQueueItem, loadOwnerHub, mergeEntries, splitEntry, updateEntry } from "./entries.server";

type Row = Record<string, unknown>;

/** A tiny in-memory Postgres: select/insert/update/delete with eq/in/maybeSingle/single. */
function fakeDb(seed: Record<string, Row[]>, opts: { failTable?: string } = {}) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let n = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    let filters: Array<(r: Row) => boolean> = [];
    let mode: "select" | "update" | "delete" | "insert" = "select";
    let patch: Row = {};
    let inserted: Row | null = null;
    const matches = () => rows.filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (opts.failTable === table) return { data: null, error: { code: "XX000", message: "boom" } };
      if (mode === "update") {
        const hit = matches();
        hit.forEach((r) => Object.assign(r, patch));
        return { data: hit.map((r) => ({ id: r.id })), error: null };
      }
      if (mode === "delete") {
        const hit = new Set(matches());
        tables[table] = rows.filter((r) => !hit.has(r));
        return { data: null, error: null };
      }
      if (mode === "insert") return { data: inserted ? [inserted] : [], error: null };
      return { data: matches(), error: null };
    };
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; };
    b.order = () => b;
    b.in = (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b; };
    b.update = (p: Row) => { mode = "update"; patch = p; return b; };
    b.delete = () => { mode = "delete"; return b; };
    b.insert = (row: Row) => {
      mode = "insert";
      if (opts.failTable !== table) {
        inserted = { id: `new-${(n += 1)}`, ...row };
        rows.push(inserted);
      }
      return b;
    };
    b.maybeSingle = async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error }; };
    b.single = async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error }; };
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok);
    return b;
  };
  return { admin: { from } as never, tables };
}

const T = "tenant-1";
const member = (role: string) => ({ tenant_id: T, profile_id: "u1", status: "active", role });
const listing = (id: string, over: Row = {}): Row => ({
  id, tenant_id: T, talent_profile_id: `p-${id}`, offering_id: `o-${id}`, status: "accepted", price_mode: "talent_price",
  booking_type: "request", currency: "USD", entry_id: null, owner_skipped_at: null, ...over,
});
const offering = (id: string, over: Row = {}): Row => ({ id: `o-${id}`, title: "Deep massage", category: "Massage", duration_minutes: 60, amount_cents: 50000, currency: "USD", ...over });
const talent = (id: string): Row => ({ id: `p-${id}`, display_name: `Talent ${id}` });

function seed(over: Record<string, Row[]> = {}) {
  return {
    agency_memberships: [member("owner")],
    workspace_service_entries: [],
    workspace_service_listings: [listing("a"), listing("b")],
    talent_offerings: [offering("a"), offering("b", { duration_minutes: 70 })],
    talent_profiles: [talent("a"), talent("b")],
    ...over,
  };
}
const ctxFor = (admin: never) => ({ admin, tenantId: T, userId: "u1" });

test("the hub loads: waiting listings become the review queue, with a suggested group", async () => {
  const db = fakeDb(seed());
  const hub = await loadOwnerHub(db.admin, T);
  assert.ok(hub.ok);
  assert.equal(hub.queue.length, 2);
  assert.equal(hub.suggestions.length, 1);
  assert.deepEqual(hub.suggestions[0].listingIds.sort(), ["a", "b"]);
});

test("a failed read is a failure, never an empty hub; a missing entries table is 'not ready' with the queue still working", async () => {
  assert.deepEqual(await loadOwnerHub(fakeDb(seed(), { failTable: "workspace_service_listings" }).admin, T), { ok: false });
  assert.deepEqual(await loadOwnerHub(fakeDb(seed(), { failTable: "talent_offerings" }).admin, T), { ok: false });
});

test("new entry from the queue: created from the listing, the listing moves in", async () => {
  const db = fakeDb(seed());
  const r = await decideQueueItem(ctxFor(db.admin), { listingId: "a", decision: { kind: "new_entry" } });
  assert.ok(r.ok && r.entryId);
  assert.equal(db.tables.workspace_service_entries.length, 1);
  assert.equal(db.tables.workspace_service_entries[0].name, "Deep massage");
  assert.equal(db.tables.workspace_service_entries[0].tenant_id, T);
  assert.equal(db.tables.workspace_service_listings.find((l) => l.id === "a")!.entry_id, r.entryId);
});

test("accept into a group only when it is compatible; otherwise blocked with the reasons and nothing changes", async () => {
  const entry = { id: "e1", tenant_id: T, name: "Massage", category: "Massage", booking_type: "request" };
  const ok = fakeDb(seed({ workspace_service_entries: [entry], workspace_service_listings: [listing("a", { entry_id: "e1" }), listing("b")] }));
  const r = await decideQueueItem(ctxFor(ok.admin), { listingId: "b", decision: { kind: "accept_into_group", entryId: "e1" } });
  assert.deepEqual(r, { ok: true, entryId: "e1" });
  const bad = fakeDb(seed({ workspace_service_entries: [entry], workspace_service_listings: [listing("a", { entry_id: "e1" }), listing("b")], talent_offerings: [offering("a"), offering("b", { duration_minutes: 120, category: "Yoga" })] }));
  const r2 = await decideQueueItem(ctxFor(bad.admin), { listingId: "b", decision: { kind: "accept_into_group", entryId: "e1" } });
  assert.deepEqual(r2, { ok: false, reason: "blocked", blockers: ["category", "duration"] });
  assert.equal(bad.tables.workspace_service_listings.find((l) => l.id === "b")!.entry_id, null);
});

test("skip marks it so it leaves the queue", async () => {
  const db = fakeDb(seed());
  assert.deepEqual(await decideQueueItem(ctxFor(db.admin), { listingId: "a", decision: { kind: "skip" } }), { ok: true });
  const hub = await loadOwnerHub(db.admin, T);
  assert.ok(hub.ok);
  assert.deepEqual(hub.queue.map((q) => q.listing.listingId), ["b"]);
});

test("a viewer or a manager cannot decide the queue; an editor can", async () => {
  for (const role of ["viewer", "coordinator"]) {
    const db = fakeDb(seed({ agency_memberships: [member(role)] }));
    assert.deepEqual(await decideQueueItem(ctxFor(db.admin), { listingId: "a", decision: { kind: "skip" } }), { ok: false, reason: "not_allowed" });
    assert.equal(db.tables.workspace_service_listings.find((l) => l.id === "a")!.owner_skipped_at, null);
  }
  const db = fakeDb(seed({ agency_memberships: [member("editor")] }));
  assert.deepEqual(await decideQueueItem(ctxFor(db.admin), { listingId: "a", decision: { kind: "skip" } }), { ok: true });
});

test("an unreadable role fails closed", async () => {
  const db = fakeDb(seed(), { failTable: "agency_memberships" });
  assert.deepEqual(await decideQueueItem(ctxFor(db.admin), { listingId: "a", decision: { kind: "skip" } }), { ok: false, reason: "unavailable" });
});

test("a listing the talent has not accepted, or another workspace's, is not found", async () => {
  const db = fakeDb(seed({ workspace_service_listings: [listing("a", { status: "offered" }), listing("x", { tenant_id: "other" })] }));
  assert.deepEqual(await decideQueueItem(ctxFor(db.admin), { listingId: "a", decision: { kind: "skip" } }), { ok: false, reason: "not_found" });
  assert.deepEqual(await decideQueueItem(ctxFor(db.admin), { listingId: "x", decision: { kind: "skip" } }), { ok: false, reason: "not_found" });
});

test("merge moves the members and removes the emptied entry; incompatible entries are refused", async () => {
  const e = (id: string) => ({ id, tenant_id: T, name: id, booking_type: "request" });
  const db = fakeDb(seed({ workspace_service_entries: [e("e1"), e("e2")], workspace_service_listings: [listing("a", { entry_id: "e1" }), listing("b", { entry_id: "e2" })] }));
  assert.deepEqual(await mergeEntries(ctxFor(db.admin), { keepId: "e1", mergeId: "e2" }), { ok: true, entryId: "e1" });
  assert.equal(db.tables.workspace_service_listings.find((l) => l.id === "b")!.entry_id, "e1");
  assert.equal(db.tables.workspace_service_entries.length, 1);
  const bad = fakeDb(seed({ workspace_service_entries: [e("e1"), e("e2")], workspace_service_listings: [listing("a", { entry_id: "e1" }), listing("b", { entry_id: "e2" })], talent_offerings: [offering("a"), offering("b", { duration_minutes: 120 })] }));
  assert.deepEqual(await mergeEntries(ctxFor(bad.admin), { keepId: "e1", mergeId: "e2" }), { ok: false, reason: "blocked", blockers: ["duration"] });
  assert.equal(bad.tables.workspace_service_entries.length, 2);
});

test("split moves the chosen listings into a new entry and refuses emptying the entry", async () => {
  const e1 = { id: "e1", tenant_id: T, name: "Massage", category: "Massage", booking_type: "request", currency: "USD", show_who: "name", client_contact: "workspace" };
  const db = fakeDb(seed({ workspace_service_entries: [e1], workspace_service_listings: [listing("a", { entry_id: "e1" }), listing("b", { entry_id: "e1" })] }));
  const r = await splitEntry(ctxFor(db.admin), { entryId: "e1", listingIds: ["b"] });
  assert.ok(r.ok && r.entryId && r.entryId !== "e1");
  assert.equal(db.tables.workspace_service_listings.find((l) => l.id === "b")!.entry_id, r.entryId);
  assert.equal(db.tables.workspace_service_listings.find((l) => l.id === "a")!.entry_id, "e1");
  assert.deepEqual(await splitEntry(ctxFor(db.admin), { entryId: "e1", listingIds: ["a"] }), { ok: false, reason: "invalid" });
});

test("entry settings: an editor changes the name but not the hub price; an admin changes both", async () => {
  const e1 = { id: "e1", tenant_id: T, name: "Old", booking_type: "request" };
  const editor = fakeDb(seed({ agency_memberships: [member("editor")], workspace_service_entries: [e1] }));
  assert.deepEqual(await updateEntry(ctxFor(editor.admin), { entryId: "e1", patch: { name: "New" } }), { ok: true, entryId: "e1" });
  assert.equal(editor.tables.workspace_service_entries[0].name, "New");
  assert.deepEqual(await updateEntry(ctxFor(editor.admin), { entryId: "e1", patch: { hubPriceCents: 100 } }), { ok: false, reason: "not_allowed", fields: ["hubPriceCents"] });
  assert.equal(editor.tables.workspace_service_entries[0].hub_price_cents, undefined);
  const admin = fakeDb(seed({ workspace_service_entries: [e1] }));
  assert.deepEqual(await updateEntry(ctxFor(admin.admin), { entryId: "e1", patch: { hubPriceCents: 9000, showWho: "portfolio" } }), { ok: true, entryId: "e1" });
  assert.equal(admin.tables.workspace_service_entries[0].hub_price_cents, 9000);
  assert.equal(admin.tables.workspace_service_entries[0].show_who, "portfolio");
});

test("the workspace's own service joins the same list; a talent's offering cannot", async () => {
  const db = fakeDb(seed({ talent_offerings: [offering("a"), { id: "own-1", tenant_id: T, owner_kind: "workspace", title: "Studio hire", category: "Rooms", amount_cents: 20000, currency: "USD" }] }));
  const r = await addOwnService(ctxFor(db.admin), { offeringId: "own-1" });
  assert.ok(r.ok);
  assert.equal(db.tables.workspace_service_entries[0].own_offering_id, "own-1");
  assert.equal(db.tables.workspace_service_entries[0].hub_price_cents, 20000);
  assert.deepEqual(await addOwnService(ctxFor(db.admin), { offeringId: "o-a" }), { ok: false, reason: "not_found" });
});

// ── photo picker ──────────────────────────────────────────────────────────────
const media = (offeringId: string, mediaId: string, sort = 0): Row => ({ offering_id: offeringId, sort_order: sort, media_asset_id: mediaId, media_assets: { public_url: `https://img/${mediaId}.jpg`, bucket_id: null, storage_path: null } });
const photoSeed = () => {
  const e1 = { id: "e1", tenant_id: T, name: "Massage", booking_type: "request" };
  return seed({
    workspace_service_entries: [e1],
    workspace_service_listings: [listing("a", { entry_id: "e1" }), listing("b", { entry_id: "e1" })],
    talent_offering_media: [media("o-a", "m1"), media("o-b", "m2"), media("o-zzz", "m-other")],
  });
};

test("the hub offers an entry the photos of its own members only", async () => {
  const hub = await loadOwnerHub(fakeDb(photoSeed()).admin, T);
  assert.ok(hub.ok);
  if (hub.ok) assert.deepEqual(hub.entries[0].photoChoices.map((c) => c.mediaId).sort(), ["m1", "m2"]);
});

test("choosing one of the entry's own photos works; another workspace's media id is refused", async () => {
  const db = fakeDb(photoSeed());
  assert.deepEqual(await updateEntry(ctxFor(db.admin), { entryId: "e1", patch: { photoMediaId: "m2" } }), { ok: true, entryId: "e1" });
  assert.equal(db.tables.workspace_service_entries[0].photo_media_id, "m2");
  assert.deepEqual(await updateEntry(ctxFor(db.admin), { entryId: "e1", patch: { photoMediaId: "m-other" } }), { ok: false, reason: "invalid", fields: ["photoMediaId"] });
  assert.equal(db.tables.workspace_service_entries[0].photo_media_id, "m2");
  assert.deepEqual(await updateEntry(ctxFor(db.admin), { entryId: "e1", patch: { photoMediaId: null } }), { ok: true, entryId: "e1" });
});

test("a photo change refuses when the photos cannot be read (fail closed)", async () => {
  const db = fakeDb(photoSeed(), { failTable: "talent_offering_media" });
  assert.deepEqual(await updateEntry(ctxFor(db.admin), { entryId: "e1", patch: { photoMediaId: "m1" } }), { ok: false, reason: "unavailable" });
});
