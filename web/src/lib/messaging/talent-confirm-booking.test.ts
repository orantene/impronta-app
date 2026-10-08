import assert from "node:assert/strict";
import { test } from "node:test";

import type { AcceptOfferForPayment, AcceptPaymentResult } from "./accept-offer-payment-core";
import type { AcceptCollection } from "./accept-offer-collection";
import {
  acceptOfferFromRow,
  confirmAcceptedOffer,
  loadConfirmState,
  offerLinesAreHers,
  talentMaySell,
  type ConfirmBookingStore,
  type ConfirmFacts,
  type ConfirmOfferRow,
} from "./talent-confirm-booking";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const OFFER: ConfirmOfferRow = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  version: 2,
  status: "accepted",
  totalCents: 120000,
  currency: "MXN",
  createdByUserId: "99999999-9999-4999-8999-999999999999",
  depositPct: null,
  depositCents: null,
  lineTalentIds: [ME],
};

const FULL: AcceptCollection = { collect: "full", amountCents: 120000, source: "policy" };
const NONE: AcceptCollection = { collect: "none", amountCents: 0, source: "policy" };

/** A store whose world is a mutable `facts`; `run` records calls and plays the scripted answers. */
function fakeStore(initial: Partial<ConfirmFacts> & { offer?: ConfirmOfferRow | null }, script: AcceptPaymentResult[] = [], plan: AcceptCollection | null = FULL) {
  const world: { facts: ConfirmFacts; readable: boolean; runs: AcceptOfferForPayment[] } = {
    facts: { offer: OFFER, booking: null, paymentRequested: false, ...initial },
    readable: true,
    runs: [],
  };
  const answers = [...script];
  const store: ConfirmBookingStore = {
    loadFacts: async () => (world.readable ? { ok: true, facts: world.facts } : { ok: false }),
    run: async (offer) => {
      world.runs.push(offer);
      const next = answers.shift();
      if (!next) throw new Error("run called more times than scripted");
      // Mirror the engine: the booking is written BEFORE the link, so it outlives a link failure.
      if ((next.ok || next.reason === "link_unavailable") && !world.facts.booking) world.facts.booking = { id: "bk-1", origin: "ours" };
      if (next.ok) world.facts.paymentRequested = true;
      return next;
    },
    previewCollection: async () => plan,
  };
  return { store, world };
}

const OK_FULL: AcceptPaymentResult = { ok: true, collection: FULL, payCode: "abc123", orderId: "ord-1", cardPosted: true, bookingId: "bk-1", scheduled: false };

test("talentMaySell: only the seller, and not while invited or declined", () => {
  assert.equal(talentMaySell({ isSeller: true, participantStatus: "active" }), true);
  assert.equal(talentMaySell({ isSeller: true, participantStatus: "none" }), true);
  assert.equal(talentMaySell({ isSeller: false, participantStatus: "active" }), false);
  assert.equal(talentMaySell({ isSeller: true, participantStatus: "invited" }), false);
  assert.equal(talentMaySell({ isSeller: true, participantStatus: "declined" }), false);
});

test("offerLinesAreHers: every named line talent must be her; unassigned lines pass", () => {
  assert.equal(offerLinesAreHers([ME], ME), true);
  assert.equal(offerLinesAreHers([], ME), true);
  assert.equal(offerLinesAreHers([ME, OTHER], ME), false);
  assert.equal(offerLinesAreHers([OTHER], ME), false);
});

test("acceptOfferFromRow maps like payAfterAccept and refuses to guess a currency", () => {
  assert.deepEqual(acceptOfferFromRow({ ...OFFER, currency: "mxn", depositPct: 30, depositCents: 36000 }), {
    id: OFFER.id,
    version: 2,
    totalCents: 120000,
    currency: "MXN",
    depositPct: 30,
    depositCents: 36000,
  });
  assert.equal(acceptOfferFromRow({ ...OFFER, currency: null }), null);
  assert.equal(acceptOfferFromRow({ ...OFFER, currency: "  " }), null);
});

test("not_owner: a stranger never reaches the store write", async () => {
  const { store, world } = fakeStore({}, []);
  const res = await confirmAcceptedOffer(store, { mayAct: false, talentProfileId: ME });
  assert.deepEqual(res, { ok: false, error: "not_owner" });
  assert.equal(world.runs.length, 0);
});

test("not_owner: an offer with another talent's line is refused", async () => {
  const { store, world } = fakeStore({ offer: { ...OFFER, lineTalentIds: [ME, OTHER] } }, []);
  const res = await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME });
  assert.deepEqual(res, { ok: false, error: "not_owner" });
  assert.equal(world.runs.length, 0);
});

test("not_accepted: no offer, a draft, a sent offer, a rejected offer", async () => {
  for (const offer of [null, { ...OFFER, status: "draft" }, { ...OFFER, status: "sent" }, { ...OFFER, status: "rejected" }, { ...OFFER, status: "superseded" }]) {
    const { store, world } = fakeStore({ offer }, []);
    const res = await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME });
    assert.deepEqual(res, { ok: false, error: "not_accepted" }, `offer ${offer?.status ?? "none"}`);
    assert.equal(world.runs.length, 0);
  }
});

test("already_converted: booking + payment request exist, returns the booking and writes nothing", async () => {
  const { store, world } = fakeStore({ booking: { id: "bk-9", origin: "ours" }, paymentRequested: true }, []);
  const res = await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME });
  assert.deepEqual(res, { ok: false, error: "already_converted", bookingId: "bk-9" });
  assert.equal(world.runs.length, 0);
});

test("already_converted: a booking made by another path is reported, never doubled", async () => {
  const { store, world } = fakeStore({ booking: { id: "bk-admin", origin: "foreign" } }, []);
  const res = await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME });
  assert.deepEqual(res, { ok: false, error: "already_converted", bookingId: "bk-admin" });
  assert.equal(world.runs.length, 0);
});

test("success: runs the engine once with the offer's own fields", async () => {
  const { store, world } = fakeStore({}, [OK_FULL]);
  const res = await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME });
  assert.deepEqual(res, { ok: true, bookingId: "bk-1", payCode: "abc123", payInPerson: false, needsTime: true });
  assert.equal(world.runs.length, 1);
  assert.deepEqual(world.runs[0], { id: OFFER.id, version: 2, totalCents: 120000, currency: "MXN", depositPct: null, depositCents: null });
});

test("success: pay in person books without a link", async () => {
  const { store } = fakeStore({}, [{ ok: true, collection: NONE, payCode: null, orderId: null, cardPosted: true, bookingId: "bk-2", scheduled: true }]);
  const res = await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME });
  assert.deepEqual(res, { ok: true, bookingId: "bk-2", payCode: null, payInPerson: true, needsTime: false });
});

test("idempotent: pressing twice after a success creates nothing the second time", async () => {
  const { store, world } = fakeStore({}, [OK_FULL]);
  const first = await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME });
  assert.equal(first.ok, true);
  const second = await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME });
  assert.deepEqual(second, { ok: false, error: "already_converted", bookingId: "bk-1" });
  assert.equal(world.runs.length, 1);
});

test("payment_link_failed keeps the booking, then a retry runs only the payment part and succeeds", async () => {
  const { store, world } = fakeStore({}, [{ ok: false, reason: "link_unavailable", collection: FULL }, OK_FULL]);
  const failed = await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME });
  assert.deepEqual(failed, { ok: false, error: "payment_link_failed", bookingId: "bk-1" });
  // The control now reads "retry payment", not "confirm booking".
  const mid = await loadConfirmState(store, { mayAct: true, talentProfileId: ME });
  assert.equal(mid.ok && mid.view.state, "retry_payment");
  assert.equal(mid.ok && mid.view.bookingId, "bk-1");
  const retried = await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME });
  assert.deepEqual(retried, { ok: true, bookingId: "bk-1", payCode: "abc123", payInPerson: false, needsTime: true });
  assert.equal(world.runs.length, 2);
  const after = await loadConfirmState(store, { mayAct: true, talentProfileId: ME });
  assert.equal(after.ok && after.view.state, "done");
});

test("booking_failed: order or booking could not be written, nothing is claimed", async () => {
  for (const reason of ["order_unavailable", "booking_unavailable"] as const) {
    const { store } = fakeStore({}, [{ ok: false, reason }]);
    assert.deepEqual(await confirmAcceptedOffer(store, { mayAct: true, talentProfileId: ME }), { ok: false, error: "booking_failed" });
  }
});

test("unavailable: unreadable facts, an unreadable policy, or a row with no currency never write", async () => {
  const unreadable = fakeStore({}, []);
  unreadable.world.readable = false;
  assert.deepEqual(await confirmAcceptedOffer(unreadable.store, { mayAct: true, talentProfileId: ME }), { ok: false, error: "unavailable" });

  const noPolicy = fakeStore({}, [{ ok: false, reason: "policy_unavailable" }]);
  assert.deepEqual(await confirmAcceptedOffer(noPolicy.store, { mayAct: true, talentProfileId: ME }), { ok: false, error: "unavailable" });

  const noCurrency = fakeStore({ offer: { ...OFFER, currency: null } }, []);
  assert.deepEqual(await confirmAcceptedOffer(noCurrency.store, { mayAct: true, talentProfileId: ME }), { ok: false, error: "unavailable" });
  assert.equal(noCurrency.world.runs.length, 0);
});

test("loadConfirmState: hidden for a stranger, ready with the amount, done after", async () => {
  const stranger = fakeStore({}, []);
  const hidden = await loadConfirmState(stranger.store, { mayAct: false, talentProfileId: ME });
  assert.deepEqual(hidden, { ok: true, view: { state: "hidden", bookingId: null, amountLabel: null, collect: null } });

  const ready = await loadConfirmState(fakeStore({}, []).store, { mayAct: true, talentProfileId: ME });
  assert.equal(ready.ok && ready.view.state, "ready");
  assert.equal(ready.ok && ready.view.collect, "full");
  assert.match((ready.ok && ready.view.amountLabel) || "", /1,200\.00/);

  const inPerson = await loadConfirmState(fakeStore({}, [], NONE).store, { mayAct: true, talentProfileId: ME });
  assert.equal(inPerson.ok && inPerson.view.amountLabel, null);
  assert.equal(inPerson.ok && inPerson.view.collect, "none");

  const done = await loadConfirmState(fakeStore({ booking: { id: "bk-1", origin: "ours" }, paymentRequested: true }, []).store, { mayAct: true, talentProfileId: ME });
  assert.equal(done.ok && done.view.state, "done");

  const other = await loadConfirmState(fakeStore({ offer: { ...OFFER, lineTalentIds: [OTHER] } }, []).store, { mayAct: true, talentProfileId: ME });
  assert.equal(other.ok && other.view.state, "hidden");

  const down = fakeStore({}, []);
  down.world.readable = false;
  assert.deepEqual(await loadConfirmState(down.store, { mayAct: true, talentProfileId: ME }), { ok: false });
});
