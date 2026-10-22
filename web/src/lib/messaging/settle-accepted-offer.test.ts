import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { settleAcceptedOffer, type SettleStore } from "./settle-accepted-offer";

function fake(over: { offer?: string; status?: string; current?: string | null; version?: number } = {}) {
  const state = { offer: over.offer ?? "sent", status: over.status ?? "offer_pending", version: over.version ?? 7 };
  const store: SettleStore = {
    async acceptSentOffer() {
      if (state.offer !== "sent") return false;
      state.offer = "accepted";
      return true;
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
    assert.deepEqual(state, { offer: "accepted", status: "booked", version: 8 });
  });
  it("is idempotent: a replay changes nothing", async () => {
    const { state, store } = fake();
    await settleAcceptedOffer(store, { offerId: "o1" });
    assert.deepEqual(await settleAcceptedOffer(store, { offerId: "o1" }), { offerAccepted: false, inquiryBooked: false });
    assert.equal(state.version, 8);
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
  });
  it("the booking step calls the settle helper", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "accept-offer-payment.ts"), "utf8");
    const body = src.slice(src.indexOf("async ensureBooking"), src.indexOf("async ensureBooking") + 1200);
    assert.match(body, /settleAcceptedOfferFor/);
  });
});
