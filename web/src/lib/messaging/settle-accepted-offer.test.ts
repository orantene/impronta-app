import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { senderApprovalIds, settleAcceptedOffer, type SettleStore } from "./settle-accepted-offer";

function fake(over: { offer?: string; status?: string; current?: string | null; version?: number } = {}) {
  const state = { offer: over.offer ?? "sent", status: over.status ?? "offer_pending", version: over.version ?? 7, senderSettled: 0, events: 0 };
  const store: SettleStore = {
    async acceptSentOffer() {
      if (state.offer !== "sent") return false;
      state.offer = "accepted";
      return true;
    },
    async settleSenderApprovals() {
      state.senderSettled += 1;
      return 1;
    },
    async emitStatusChange() {
      state.events += 1;
    },
    async loadInquiry() {
      return { status: state.status, version: state.version, currentOfferId: over.current === undefined ? "o1" : over.current };
    },
    async bookInquiry(v) {
      if (v !== state.version) return false;
      state.status = "booked";
      state.version += 1;
      return true;
    },
  };
  return { state, store };
}

describe("TUL-1899: a paid offer is accepted and the inquiry is booked", () => {
  it("sent offer on an offer_pending inquiry becomes accepted + booked, version bumped", async () => {
    const { state, store } = fake();
    assert.deepEqual(await settleAcceptedOffer(store, { offerId: "o1" }), { offerAccepted: true, inquiryBooked: true });
    assert.deepEqual(state, { offer: "accepted", status: "booked", version: 8, senderSettled: 1, events: 1 });
  });
  it("is idempotent: a replay changes nothing", async () => {
    const { state, store } = fake();
    await settleAcceptedOffer(store, { offerId: "o1" });
    assert.deepEqual(await settleAcceptedOffer(store, { offerId: "o1" }), { offerAccepted: false, inquiryBooked: false });
    assert.equal(state.version, 8);
    assert.equal(state.events, 1, "the status-change event fires once");
  });
  it("an engine-accepted offer on an approved inquiry still gets booked", async () => {
    const { state, store } = fake({ offer: "accepted", status: "approved" });
    assert.deepEqual(await settleAcceptedOffer(store, { offerId: "o1" }), { offerAccepted: false, inquiryBooked: true });
    assert.equal(state.status, "booked");
  });
  it("does not book the inquiry when a newer offer is current", async () => {
    const { state, store } = fake({ current: "o2" });
    assert.equal((await settleAcceptedOffer(store, { offerId: "o1" })).inquiryBooked, false);
    assert.equal(state.status, "offer_pending");
    assert.equal(state.events, 0);
  });
  it("the booking step calls the settle helper", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "accept-offer-payment.ts"), "utf8");
    const body = src.slice(src.indexOf("async ensureBooking"), src.indexOf("async ensureBooking") + 1200);
    assert.match(body, /settleAcceptedOfferFor/);
  });

  it("the sender's pending approval is settled; the client and a second talent are not", () => {
    const rows = [
      { id: "a-client", role: "client", participantUserId: "u-client", talentProfileId: null },
      { id: "a-sender", role: "talent", participantUserId: null, talentProfileId: "tp1" },
      { id: "a-other", role: "talent", participantUserId: null, talentProfileId: "tp2" },
      { id: "a-staff", role: "coordinator", participantUserId: "u-staff", talentProfileId: null },
    ];
    const owners = new Map<string, string | null>([["tp1", "u-sender"], ["tp2", "u-other"]]);
    assert.deepEqual(senderApprovalIds(rows, "u-sender", owners), ["a-sender"]);
    assert.deepEqual(senderApprovalIds(rows, "u-staff", owners), ["a-staff"]);
    assert.deepEqual(senderApprovalIds(rows, null, owners), []);
  });
  it("settle writes the implicit_on_send note and only touches pending rows", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "settle-accepted-offer.ts"), "utf8");
    assert.match(src, /implicit_on_send/);
    assert.match(src, /\.update\(\{ status: "accepted", decided_at: at, updated_at: at, notes: IMPLICIT_ON_SEND_NOTE \}\)/);
    assert.match(src, /\.eq\("status", "pending"\)\s*\.select\("id"\)/);
    assert.match(src, /emitStandardEngineEvent/);
  });
  it("a late approve on an already-accepted offer returns success before the engine RPC", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../inquiry/inquiry-engine-approvals.ts"), "utf8");
    const guard = src.indexOf('=== "accepted") return { success: true, already: true }');
    assert.ok(guard > 0);
    assert.ok(guard < src.indexOf('supabase.rpc("engine_submit_approval"'));
  });
});
