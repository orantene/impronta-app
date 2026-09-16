import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { guestVisitAddLine, guestVisitPayShare, posLineOfferSubstitute } from "./guest-order";
import { fakeAdmin, makeStore, type Row } from "@/lib/pos/__fixtures__/pos-store";

test("guestVisitAddLine refuses a closed visit before writing a draft", async () => {
  const admin = {
    rpc: async () => ({ data: null, error: null }),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () =>
                table === "visits"
                  ? { data: { id: "v1", tenant_id: "t1", space_id: "s1", status: "closed" }, error: null }
                  : { data: null, error: null },
            }),
            maybeSingle: async () =>
              table === "visits"
                ? { data: { id: "v1", tenant_id: "t1", space_id: "s1", status: "closed", public_token: "tok", opened_at: null, party_size: 2 }, error: null }
                : { data: null, error: null },
          }),
        }),
      }),
    }),
  };
  const result = await guestVisitAddLine(admin, {
    tenantId: "t1",
    token: "tokentok",
    offeringId: "11111111-1111-4111-8111-111111111111",
    qty: 1,
    actorUserId: "u1",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.reason === "visit_closed" || result.reason === "not_found" || result.reason === "unavailable");
});

test("posLineOfferSubstitute maps not_found", async () => {
  const admin = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    rpc: async () => ({ data: { ok: false, reason: "not_found" }, error: null }),
  };
  const result = await posLineOfferSubstitute(admin, {
    tenantId: "t1",
    lineId: "11111111-1111-4111-8111-111111111111",
    substituteOfferingId: "22222222-2222-4222-8222-222222222222",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "not_found");
});

test("guest substitute SQL is service_role only", () => {
  const sql = readFileSync(
    join(process.cwd(), "..", "supabase", "migrations", "20261231226000_guest_qr_substitutes.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.order_line_substitute_offers/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.pos_line_offer_substitute/);
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPENED_BY = "0f3c6b7a-2d1e-4c5b-9a8f-7e6d5c4b3a21";

/**
 * A pay-share store: one open visit at a table, opened by an operator, with one
 * open order. The reserve rpc is wrapped so the test can read the actor the
 * engine was handed; the fixture's own model answers the call.
 */
function payShareStore(openedBy: string | null) {
  const store = makeStore();
  (store as Record<string, Row[]>).visits = [
    { id: "v1", tenant_id: "t1", space_id: "s1", status: "open", public_token: "tokentok", opened_at: null, party_size: 2, opened_by: openedBy },
  ];
  store.orders.push({ id: "o1", tenant_id: "t1", visit_id: "v1", status: "pending_payment", currency: "USD", total_cents: 4000, version: 1, created_at: "2026-09-16T00:00:00Z" });
  const base = fakeAdmin(store);
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const admin = {
    from: base.from,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return base.rpc(fn, args);
    },
  };
  return { store, admin, rpcCalls };
}

test("guestVisitPayShare reserves the collection as the operator who opened the table, never as \"\" (D-149)", async () => {
  const { store, admin, rpcCalls } = payShareStore(OPENED_BY);
  const result = await guestVisitPayShare(admin, {
    tenantId: "t1",
    token: "tokentok",
    amountCents: 1500,
    actorUserId: "",
    publicOrigin: "https://elpaisa.example",
    operationKey: "share-op-key-1",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const reserve = rpcCalls.find((c) => c.fn === "pos_reserve_collection");
  assert.ok(reserve, "the collection was reserved");
  assert.equal(reserve!.args.p_actor_id, OPENED_BY);
  assert.match(String(reserve!.args.p_actor_id), UUID_RE);
  for (const call of rpcCalls) {
    for (const [k, v] of Object.entries(call.args)) assert.notEqual(v, "", `${call.fn}.${k} must never be an empty string`);
  }
  const link = ((store as Record<string, Row[]>).payment_links ?? [])[0];
  assert.ok(link, "a payment link was minted");
  assert.equal(link.created_by, OPENED_BY);
  if (result.ok) assert.match(result.url, /^https:\/\/elpaisa\.example\/pay\//);
});

test("guestVisitPayShare hands the engine NULL, not \"\", when the visit names no opener", async () => {
  const { store, admin, rpcCalls } = payShareStore(null);
  const result = await guestVisitPayShare(admin, {
    tenantId: "t1",
    token: "tokentok",
    amountCents: 1500,
    actorUserId: "",
    publicOrigin: "https://elpaisa.example",
    operationKey: "share-op-key-2",
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const reserve = rpcCalls.find((c) => c.fn === "pos_reserve_collection");
  assert.ok(reserve);
  assert.equal(reserve!.args.p_actor_id, null);
  const link = ((store as Record<string, Row[]>).payment_links ?? [])[0];
  assert.equal(link?.created_by, null);
});
