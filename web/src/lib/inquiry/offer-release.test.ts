import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { announceHeldOffer, noteHeldOfferReturned, releaseOfferToClient } from "./offer-release";

const ctx = { inquiryId: "i1", tenantId: "t1", offerId: "o1", actorUserId: "u-staff" };

function fake() {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({ data: { total_client_price: 1000, currency_code: "MXN" }, error: null });
      q.insert = async (row: Record<string, unknown>) => { inserts.push({ table, row }); return { error: null }; };
      q.update = (patch: Record<string, unknown>) => { updates.push({ table, patch }); return q; };
      q.then = (resolve: (v: { error: null }) => unknown) => resolve({ error: null });
      return q;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      return { then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }) };
    },
  } as unknown as SupabaseClient;
  const emitted: string[] = [];
  const deps = { emit: (async (_c: unknown, input: { type: string }) => { emitted.push(input.type); return { errors: [] }; }) as never };
  return { client, inserts, updates, rpcs, emitted, deps };
}

test("staff send with a pending talent: the client gets NOTHING (no OFFER_SENT, no client-thread card), staff get an internal note", async () => {
  const f = fake();
  await announceHeldOffer(f.client, ctx);
  assert.deepEqual(f.emitted, []);
  const privateRows = f.inserts.filter((i) => i.row.thread_type === "private");
  assert.equal(privateRows.length, 1);
  assert.equal(privateRows[0]!.row.message_kind, "internal_note");
  assert.ok(!f.inserts.some((i) => i.row.thread_type === "private" && i.row.message_kind === "offer_event"), "no client-visible card");
  assert.ok(f.inserts.some((i) => i.row.thread_type === "group"), "the talent is told in the group thread");
  assert.equal(f.rpcs[0]!.args.p_kind, "offer_awaiting_talent");
});

test("last talent approves: the offer is released, the client is notified once, the validity clock restarts", async () => {
  const f = fake();
  await releaseOfferToClient(f.client, { ...ctx, restampExpiry: true, skipTalentCard: true }, f.deps);
  assert.deepEqual(f.emitted, ["offer.sent"]);
  assert.equal(f.emitted.length, 1);
  assert.ok(f.updates.some((u) => u.table === "inquiry_offers" && typeof u.patch.valid_until === "string"), "valid_until restamped");
  const priv = f.inserts.find((i) => i.row.thread_type === "private");
  assert.equal(priv?.row.message_kind, "offer_event");
  assert.ok(!f.inserts.some((i) => i.row.thread_type === "group"), "the talent card already exists from the hold");
  assert.equal(f.rpcs[0]!.args.p_kind, "offer_sent");
});

test("the staff send action posts no offer_review card for a held offer; the release posts it", async () => {
  const { readFileSync: rf } = await import("node:fs");
  const engine = rf(join(process.cwd(), "src/lib/server-actions/messaging-engine.ts"), "utf8");
  const send = engine.slice(engine.indexOf("const sent = await sendOffer("));
  const heldGuard = send.indexOf('status === "awaiting_talent") return { ok: true as const }');
  const card = send.indexOf('kind: "offer_review"');
  assert.ok(heldGuard > 0 && card > heldGuard, "the held guard runs before the card is posted");
  const approvals = rf(join(process.cwd(), "src/lib/inquiry/inquiry-engine-approvals.ts"), "utf8");
  assert.match(approvals, /postOfferReviewCard: true/);
});

test("an offer that was never held releases exactly as before (event, audit, both cards, no restamp)", async () => {
  const f = fake();
  await releaseOfferToClient(f.client, ctx, f.deps);
  assert.equal(f.emitted.length, 1);
  assert.equal(f.updates.length, 0);
  assert.ok(f.inserts.some((i) => i.row.thread_type === "private" && i.row.message_kind === "offer_event"));
  assert.ok(f.inserts.some((i) => i.row.thread_type === "group"));
});

test("a talent rejection returns the offer to draft: staff get her note, the client gets nothing", async () => {
  const f = fake();
  await noteHeldOfferReturned(f.client, { ...ctx, notes: "Too low for a full day" });
  assert.equal(f.inserts.length, 1);
  assert.equal(f.inserts[0]!.row.message_kind, "internal_note");
  assert.match(String(f.inserts[0]!.row.body), /back in draft/);
  assert.match(String(f.inserts[0]!.row.body), /Too low for a full day/);
  assert.equal(f.emitted.length, 0);
});

test("the engine wires the hold: sendOffer branches on awaiting_talent, submitApproval on the RPC transitions", () => {
  const offers = readFileSync(join(process.cwd(), "src/lib/inquiry/inquiry-engine-offers.ts"), "utf8");
  assert.match(offers, /status === "awaiting_talent"/);
  assert.match(offers, /announceHeldOffer\(/);
  assert.match(offers, /releaseOfferToClient\(/);
  const approvals = readFileSync(join(process.cwd(), "src/lib/inquiry/inquiry-engine-approvals.ts"), "utf8");
  assert.match(approvals, /transition === "released_to_client"/);
  assert.match(approvals, /heldAdmin\(\) \?\? supabase/, "held detection and the release use the service role (a talent session cannot read a held offer)");
  assert.match(approvals, /releaseOfferToClient\(heldWriter/);
  assert.match(approvals, /noteHeldOfferReturned\(heldWriter/);
  assert.match(approvals, /transition === "returned_to_draft"/);
  assert.match(approvals, /restampExpiry: true/);
});
