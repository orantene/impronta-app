import assert from "node:assert/strict";
import { test } from "node:test";

import { AWAITING_TALENT_TIMEOUT_NOTE, sweepAwaitingTalentOffers } from "./awaiting-talent-expiry";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();

type Offer = { id: string; inquiry_id: string; tenant_id: string; sent_at: string | null; updated_at: string | null; status: string };
type Inq = { id: string; status: string; current_offer_id: string };

function fakeAdmin(offers: Offer[], inquiries: Inq[]) {
  const messages: Record<string, unknown>[] = [];
  const tables: Record<string, Record<string, unknown>[]> = { inquiry_offers: offers, inquiries, inquiry_messages: messages };
  const admin = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let patch: Record<string, unknown> | null = null;
      let insert: Record<string, unknown> | null = null;
      const q: Record<string, unknown> = {};
      const rows = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
      q.select = () => q;
      q.eq = (c: string, v: unknown) => { filters.push([c, v]); return q; };
      q.limit = () => q;
      q.update = (p: Record<string, unknown>) => { patch = p; return q; };
      q.insert = (r: Record<string, unknown>) => { insert = r; return q; };
      q.then = (resolve: (v: { data: unknown; error: null }) => unknown) => {
        if (insert) { tables[table]!.push(insert); return resolve({ data: null, error: null }); }
        if (patch) { const hit = rows(); for (const r of hit) Object.assign(r, patch); return resolve({ data: hit.map((r) => ({ id: r.id })), error: null }); }
        return resolve({ data: rows(), error: null });
      };
      return q;
    },
  };
  return { admin, messages };
}

test("72 h with no talent answer: the offer returns to draft, the inquiry to coordination, staff get a note", async () => {
  const offers: Offer[] = [{ id: "o1", inquiry_id: "i1", tenant_id: "t1", sent_at: ago(80), updated_at: ago(80), status: "awaiting_talent" }];
  const inquiries: Inq[] = [{ id: "i1", status: "offer_pending", current_offer_id: "o1" }];
  const { admin, messages } = fakeAdmin(offers, inquiries);
  const res = await sweepAwaitingTalentOffers(admin, NOW);
  assert.deepEqual(res, { returned: 1, inquiryIds: ["i1"] });
  assert.equal(offers[0]!.status, "draft");
  assert.equal(inquiries[0]!.status, "coordination");
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.message_kind, "internal_note");
  assert.equal(messages[0]!.body, AWAITING_TALENT_TIMEOUT_NOTE);
  assert.match(String(messages[0]!.body), /72 h/);
});

test("a wait under 72 h is left alone, and a second sweep does nothing (idempotent)", async () => {
  const offers: Offer[] = [
    { id: "o1", inquiry_id: "i1", tenant_id: "t1", sent_at: ago(10), updated_at: ago(10), status: "awaiting_talent" },
    { id: "o2", inquiry_id: "i2", tenant_id: "t1", sent_at: ago(100), updated_at: ago(100), status: "awaiting_talent" },
  ];
  const inquiries: Inq[] = [
    { id: "i1", status: "offer_pending", current_offer_id: "o1" },
    { id: "i2", status: "offer_pending", current_offer_id: "o2" },
  ];
  const { admin, messages } = fakeAdmin(offers, inquiries);
  assert.equal((await sweepAwaitingTalentOffers(admin, NOW)).returned, 1);
  assert.equal(offers[0]!.status, "awaiting_talent");
  assert.equal(inquiries[0]!.status, "offer_pending");
  assert.equal((await sweepAwaitingTalentOffers(admin, NOW)).returned, 0);
  assert.equal(messages.length, 1);
});

test("a sent offer is never touched by the awaiting-talent sweep", async () => {
  const offers: Offer[] = [{ id: "o1", inquiry_id: "i1", tenant_id: "t1", sent_at: ago(200), updated_at: ago(200), status: "sent" }];
  const { admin } = fakeAdmin(offers, [{ id: "i1", status: "offer_pending", current_offer_id: "o1" }]);
  assert.equal((await sweepAwaitingTalentOffers(admin, NOW)).returned, 0);
  assert.equal(offers[0]!.status, "sent");
});
