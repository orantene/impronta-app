/** TUL-1066: the guards behind the guest's undo writers (remove a line, discard an empty draft). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { clientRemovableLine, commitmentVerdict, inquiryCommitment, isUntouchedSeedDraft } from "./client-draft-guards";

test("nothing attached and every count read: none", () => {
  assert.equal(commitmentVerdict({ offers: 0, paymentLinks: 0, settledOrders: 0, records: 0 }), "none");
});

test("any offer, payment link, settled order or record: committed (even if another count is unreadable)", () => {
  assert.equal(commitmentVerdict({ offers: 1, paymentLinks: 0, settledOrders: 0, records: 0 }), "committed");
  assert.equal(commitmentVerdict({ offers: 0, paymentLinks: 1, settledOrders: 0, records: 0 }), "committed");
  assert.equal(commitmentVerdict({ offers: 0, paymentLinks: 0, settledOrders: 2, records: 0 }), "committed");
  assert.equal(commitmentVerdict({ offers: null, paymentLinks: 0, settledOrders: 0, records: 3 }), "committed");
});

test("an unreadable count refuses: undo never guesses", () => {
  assert.equal(commitmentVerdict({ offers: 0, paymentLinks: null, settledOrders: 0, records: 0 }), "unknown");
});

function fakeAdmin(counts: Record<string, number | "error">) {
  return {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        neq: () => q,
        is: () => q,
        then(resolve: (v: { count: number | null; error: unknown }) => void) {
          const c = counts[table];
          resolve(c === "error" ? { count: null, error: new Error("boom") } : { count: c ?? 0, error: null });
        },
      };
      return q;
    },
  } as never;
}

test("inquiryCommitment reads all four tables", async () => {
  assert.equal(await inquiryCommitment(fakeAdmin({}), "t", "i"), "none");
  assert.equal(await inquiryCommitment(fakeAdmin({ inquiry_offers: 1 }), "t", "i"), "committed");
  assert.equal(await inquiryCommitment(fakeAdmin({ payment_links: 1 }), "t", "i"), "committed");
  assert.equal(await inquiryCommitment(fakeAdmin({ orders: 1 }), "t", "i"), "committed");
  assert.equal(await inquiryCommitment(fakeAdmin({ conversation_records: 1 }), "t", "i"), "committed");
  assert.equal(await inquiryCommitment(fakeAdmin({ payment_links: "error" }), "t", "i"), "unknown");
});

test("isUntouchedSeedDraft: only the seeded early draft qualifies", () => {
  const seed = { status: "draft", contact_name: "Guest", interpreted_query: { source: "agency_site", talent: { selected_ids: [] } } };
  assert.equal(isUntouchedSeedDraft(seed), true);
  assert.equal(isUntouchedSeedDraft({ ...seed, interpreted_query: { source: "public_talent_profile", talent: { selected_ids: ["a"] } } }), true);
  assert.equal(isUntouchedSeedDraft({ ...seed, interpreted_query: { source: "agency_site", talent: { selected_ids: ["a"] } } }), false);
  assert.equal(isUntouchedSeedDraft({ ...seed, interpreted_query: { source: "public_talent_profile", talent: { selected_ids: ["a", "b"] } } }), false);
  assert.equal(isUntouchedSeedDraft({ ...seed, status: "submitted" }), false);
  assert.equal(isUntouchedSeedDraft({ ...seed, contact_name: "Ana Perez" }), false);
  assert.equal(isUntouchedSeedDraft({ ...seed, interpreted_query: null }), true);
});

test("the two writers use the guards before they write (source order)", () => {
  const src = readFileSync(new URL("../server-actions/messaging-client.ts", import.meta.url), "utf8");
  const remove = src.slice(src.indexOf("export async function messagingClientRemoveItem"), src.indexOf("export async function messagingClientDiscardEmptyDraft"));
  assert.ok(remove.indexOf("inquiryCommitment(") < remove.indexOf("removeLine("), "commitment checked before the remove");
  assert.ok(remove.indexOf("clientRemovableLine(") < remove.indexOf("removeLine("));
  assert.match(remove, /clientRemovableLine\(l\.admin, orderId, parsed\.data\.lineId\)/);
  const discard = src.slice(src.indexOf("export async function messagingClientDiscardEmptyDraft"), src.indexOf("/* ---------- 4."));
  assert.ok(discard.indexOf("isUntouchedSeedDraft(") < discard.indexOf(".delete()"));
  assert.ok(discard.indexOf("inquiryCommitment(") < discard.indexOf(".delete()"));
  assert.match(discard, /\.eq\("status", "draft"\)/);
  assert.match(discard, /inquiry_messages/);
});

function fakeLine(row: { proposed_by: string | null; confirmed_at: string | null } | null) {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row }) };
  return { from: () => q } as never;
}

test("clientRemovableLine: only an unconfirmed client line on the draft", async () => {
  assert.equal(await clientRemovableLine(fakeLine({ proposed_by: "client", confirmed_at: null }), "o", "l"), "ok");
  assert.equal(await clientRemovableLine(fakeLine({ proposed_by: "client", confirmed_at: "2026-10-15T00:00:00Z" }), "o", "l"), "not_allowed");
  assert.equal(await clientRemovableLine(fakeLine({ proposed_by: "staff", confirmed_at: null }), "o", "l"), "not_allowed");
  assert.equal(await clientRemovableLine(fakeLine(null), "o", "l"), "missing");
});
