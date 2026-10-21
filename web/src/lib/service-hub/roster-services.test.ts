/**
 * TUL-1372 (slice 1): the READER behind "roster services on the workspace site".
 * Accepted listing links (talent x workspace x service) become card-ready items.
 * Must not repeat the hub leak of #4101: a talent in TWO workspaces never shows
 * workspace A's entries on workspace B, and nothing unaccepted, unsellable,
 * off-roster or unpublished ever reaches a visitor.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/service-hub/roster-services.test.ts
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { _resetRosterSellableCacheForTests, loadWorkspaceRosterServices, rosterServicePriceCents } from "./roster-services";

beforeEach(() => _resetRosterSellableCacheForTests());

type Row = Record<string, unknown>;

function fakeAdmin(tables: Record<string, Row[]>, sellable: (id: string) => boolean | "error" = () => true) {
  const rpcCalls: string[] = [];
  return {
    rpcCalls,
    client: {
      from(table: string) {
        let rows = [...(tables[table] ?? [])];
        const q: Record<string, unknown> = {};
        Object.assign(q, {
          select: () => q,
          eq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] === v)), q),
          in: (c: string, vs: unknown[]) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
          neq: (c: string, v: unknown) => ((rows = rows.filter((r) => r[c] !== v)), q),
          order: () => q, limit: () => q,
          then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
        });
        return q;
      },
      rpc: async (name: string, args: { p_listing_id: string }) => {
        rpcCalls.push(`${name}:${args.p_listing_id}`);
        const r = sellable(args.p_listing_id);
        return r === "error" ? { data: null, error: { message: "boom" } } : { data: r, error: null };
      },
    } as never,
  };
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TALENT = "tp-chef";

const listing = (over: Row): Row => ({
  id: "L1", tenant_id: A, talent_profile_id: TALENT, offering_id: "S1", status: "accepted",
  price_mode: "talent_price", margin_bps: null, price_cents: null, currency: "MXN",
  show_who: "name", client_contact: "workspace", booking_type: "request", created_at: "2026-10-01", ...over,
});

const WORLD = (): Record<string, Row[]> => ({
  workspace_service_listings: [
    listing({ id: "L1", tenant_id: A, offering_id: "S1" }),
    listing({ id: "L2", tenant_id: B, offering_id: "S2" }),
  ],
  talent_offerings: [
    { id: "S1", talent_profile_id: TALENT, title: "Chef for dinners", amount_cents: 150000, currency: "MXN", status: "published", moderation_state: "approved" },
    { id: "S2", talent_profile_id: TALENT, title: "Waiter service", amount_cents: 80000, currency: "MXN", status: "published", moderation_state: "approved" },
    { id: "S3", talent_profile_id: TALENT, title: "Private lessons (never listed)", amount_cents: 50000, currency: "MXN", status: "published", moderation_state: "approved" },
  ],
  agency_talent_roster: [
    { tenant_id: A, talent_profile_id: TALENT, status: "active" },
    { tenant_id: B, talent_profile_id: TALENT, status: "active" },
  ],
  talent_profiles: [{ id: TALENT, display_name: "Rafa Chef", deleted_at: null, is_publicly_hidden: false, is_publicly_listed: true, visibility: "public", profile_kind: "talent" }],
});

test("a talent in two workspaces: workspace A shows only A's listing, B only B's, and an unlisted service never appears", async () => {
  const a = await loadWorkspaceRosterServices(fakeAdmin(WORLD()).client, A);
  assert.deepEqual(a.map((x) => x.title), ["Chef for dinners"]);
  const b = await loadWorkspaceRosterServices(fakeAdmin(WORLD()).client, B);
  assert.deepEqual(b.map((x) => x.title), ["Waiter service"]);
  assert.ok(![...a, ...b].some((x) => /never listed/.test(x.title)));
});

test("defence in depth: a row for another tenant that slipped past the query is dropped", async () => {
  const world = WORLD();
  world.workspace_service_listings = [listing({ id: "L9", tenant_id: B, offering_id: "S2" })];
  // The fake ignores the tenant filter by returning B's row for an A read.
  const admin = fakeAdmin(world);
  const leaky = { ...admin.client as object, from: (t: string) => { const q = (admin.client as { from: (t: string) => Record<string, unknown> }).from(t); if (t === "workspace_service_listings") (q as { eq: unknown }).eq = () => q; return q; } } as never;
  assert.deepEqual(await loadWorkspaceRosterServices(leaky, A), []);
});

test("only ACCEPTED listings are read, and each must pass the database sellable check (fail closed)", async () => {
  const world = WORLD();
  world.workspace_service_listings = [
    listing({ id: "L1", status: "offered" }),
    listing({ id: "L3", status: "hidden", offering_id: "S1" }),
    listing({ id: "L4", offering_id: "S1" }),
  ];
  const admin = fakeAdmin(world, (id) => (id === "L4" ? false : true));
  assert.deepEqual(await loadWorkspaceRosterServices(admin.client, A), [], "offered, hidden and not-sellable are all out");
  assert.deepEqual(admin.rpcCalls, ["workspace_service_listing_is_sellable:L4"], "only the accepted listing is checked");
  const errored = fakeAdmin(WORLD(), () => "error");
  assert.deepEqual(await loadWorkspaceRosterServices(errored.client, A), [], "an RPC error shows nothing");
});

test("a talent who left the roster, or a service that is no longer published or approved, disappears", async () => {
  const left = WORLD();
  left.agency_talent_roster = [{ tenant_id: A, talent_profile_id: TALENT, status: "removed" }];
  assert.deepEqual(await loadWorkspaceRosterServices(fakeAdmin(left).client, A), []);
  for (const patch of [{ status: "draft" }, { moderation_state: "pending" }]) {
    const w = WORLD();
    w.talent_offerings = [{ ...w.talent_offerings![0], ...patch }];
    assert.deepEqual(await loadWorkspaceRosterServices(fakeAdmin(w).client, A), []);
  }
  const mismatch = WORLD();
  mismatch.talent_offerings = [{ ...mismatch.talent_offerings![0], talent_profile_id: "someone-else" }];
  assert.deepEqual(await loadWorkspaceRosterServices(fakeAdmin(mismatch).client, A), [], "the service must belong to the listing's talent");
});

test("show-who is respected per entry: name, portfolio only, or hidden", async () => {
  for (const [showWho, name, hasTalentId] of [["name", "Rafa Chef", true], ["portfolio", null, true], ["hidden", null, false]] as const) {
    const w = WORLD();
    w.workspace_service_listings = [listing({ show_who: showWho })];
    const [item] = await loadWorkspaceRosterServices(fakeAdmin(w).client, A);
    assert.equal(item!.talentName, name, showWho);
    assert.equal(item!.talentProfileId !== null, hasTalentId, `${showWho} talent id`);
  }
});

test("contact hiding: client_contact 'workspace' exposes no talent contact route", async () => {
  const [item] = await loadWorkspaceRosterServices(fakeAdmin(WORLD()).client, A);
  assert.equal(item!.clientContact, "workspace");
  assert.ok(!JSON.stringify(item).match(/phone|email|whatsapp/i));
});

test("price: talent price, margin, fixed and from, in the service's currency; quote-only has no number", () => {
  const base = { priceMode: "talent_price" as const, marginBps: null, priceCents: null };
  assert.equal(rosterServicePriceCents({ ...base }, 150000), 150000);
  assert.equal(rosterServicePriceCents({ ...base, priceMode: "margin", marginBps: 1000 }, 150000), 165000);
  assert.equal(rosterServicePriceCents({ ...base, priceMode: "fixed", priceCents: 200000 }, 150000), 200000);
  assert.equal(rosterServicePriceCents({ ...base, priceMode: "from", priceCents: 120000 }, 150000), 120000);
  assert.equal(rosterServicePriceCents({ ...base }, null), null, "a quote-only service shows no price");
});

test("items carry 'from' for from-priced listings and keep the service currency", async () => {
  const w = WORLD();
  w.workspace_service_listings = [listing({ price_mode: "from", price_cents: 120000, currency: "MXN" })];
  const [item] = await loadWorkspaceRosterServices(fakeAdmin(w).client, A);
  assert.deepEqual([item!.priceCents, item!.priceIsFrom, item!.currency], [120000, true, "MXN"]);
});

test("a listing with no currency (on the listing or the service) is skipped, never shown as an unlabeled price", async () => {
  const w = WORLD();
  w.workspace_service_listings = [listing({ currency: "" })];
  w.talent_offerings = [{ ...w.talent_offerings![0], currency: null }];
  assert.deepEqual(await loadWorkspaceRosterServices(fakeAdmin(w).client, A), []);
  // The service's own currency is still a valid label when the listing row has none.
  const w2 = WORLD();
  w2.workspace_service_listings = [listing({ currency: "" })];
  const [item] = await loadWorkspaceRosterServices(fakeAdmin(w2).client, A);
  assert.equal(item!.currency, "MXN");
});

// ── Consultant review (TUL-1372): privacy, caching ─────────────────────────────

test("PRIVACY: a talent hidden from the public directory is never named, whatever the flag that hides them", async () => {
  for (const hidden of [
    { is_publicly_hidden: true },
    { is_publicly_listed: false },
    { visibility: "private" },
    { deleted_at: "2026-10-01" },
    { profile_kind: "resource" },
  ]) {
    const w = WORLD();
    w.talent_profiles = [{ ...w.talent_profiles![0], ...hidden }];
    for (const showWho of ["name", "portfolio"]) {
      w.workspace_service_listings = [listing({ show_who: showWho })];
      assert.deepEqual(await loadWorkspaceRosterServices(fakeAdmin(w).client, A), [], `${JSON.stringify(hidden)} ${showWho}`);
    }
  }
  // Anonymous selling of a hidden talent is NOT allowed either: show-who only controls the NAME.
  const w = WORLD();
  w.talent_profiles = [{ ...w.talent_profiles![0], is_publicly_hidden: true }];
  w.workspace_service_listings = [listing({ show_who: "hidden" })];
  assert.deepEqual(await loadWorkspaceRosterServices(fakeAdmin(w).client, A), []);
  // A visible talent with show-who hidden is shown anonymously.
  const visible = WORLD();
  visible.workspace_service_listings = [listing({ show_who: "hidden" })];
  const [anon] = await loadWorkspaceRosterServices(fakeAdmin(visible).client, A);
  assert.equal(anon!.talentName, null);
  assert.equal(anon!.talentProfileId, null);
});

test("sellable checks run in parallel and are cached, so a public page does not repeat them", async () => {
  const w = WORLD();
  w.workspace_service_listings = [listing({ id: "La", offering_id: "S1" }), listing({ id: "Lb", offering_id: "S1" })];
  const admin = fakeAdmin(w);
  await loadWorkspaceRosterServices(admin.client, A);
  assert.equal(admin.rpcCalls.length, 2);
  await loadWorkspaceRosterServices(admin.client, A);
  assert.equal(admin.rpcCalls.length, 2, "the second render reuses the cached verdicts");
});

test("TUL-1599 (D-10a): an on-request service shows no price; a public one keeps it", async () => {
  const world = WORLD();
  world.talent_offerings = [{ ...world.talent_offerings[0], visibility: "on_request" }];
  const [item] = await loadWorkspaceRosterServices(fakeAdmin(world).client, A);
  assert.equal(item.priceCents, null);
  world.talent_offerings = [{ ...world.talent_offerings[0], visibility: "public" }];
  _resetRosterSellableCacheForTests();
  const [pub] = await loadWorkspaceRosterServices(fakeAdmin(world).client, A);
  assert.equal(pub.priceCents, 150000);
});
