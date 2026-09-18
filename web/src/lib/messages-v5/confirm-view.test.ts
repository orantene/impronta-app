import assert from "node:assert/strict";
import { test } from "node:test";

import type { OfferRow } from "@/lib/messaging/sheets";
import type { RecordChip } from "@/lib/messaging/types";

import {
  checkedCategoriesFor,
  confirmSourceOptions,
  CONFIRM_OVERRIDE_MIN_CHARS,
  createdListFor,
  depositGate,
  overrideReasonValid,
} from "./confirm-view";

const OFFER_ACCEPTED: OfferRow = { id: "of-1", status: "accepted", version: 2, totalClientPrice: 38, updatedAt: "2026-09-17T10:00:00Z", depositPct: 30, depositAmountCents: null };
const OFFER_DRAFT: OfferRow = { id: "of-2", status: "draft", version: 1, totalClientPrice: 10, updatedAt: "2026-09-17T09:00:00Z", depositPct: null, depositAmountCents: null };

function chip(over: Partial<RecordChip>): RecordChip {
  return { kind: "offer", recordId: "of-1", label: "Offer v2", paymentState: null, fulfilmentState: null, ...over };
}

test("confirmSourceOptions: only accepted offers, carrying the chip's payment state", () => {
  const options = confirmSourceOptions([chip({ paymentState: "unpaid" })], [OFFER_ACCEPTED, OFFER_DRAFT]);
  assert.equal(options.length, 1);
  assert.deepEqual(options[0], { source: "offer", id: "of-1", label: "v2", version: 2, totalCents: 3800, paymentState: "unpaid" });
});

test("confirmSourceOptions: an order chip already paid or past draft is not a candidate", () => {
  const chips: RecordChip[] = [
    { kind: "order", recordId: "or-1", label: "#1", paymentState: "paid", fulfilmentState: null },
    { kind: "order", recordId: "or-2", label: "#2", paymentState: null, fulfilmentState: "fulfilled" },
    { kind: "order", recordId: "or-3", label: "#3", paymentState: null, fulfilmentState: "hold" },
  ];
  const options = confirmSourceOptions(chips, []);
  assert.deepEqual(
    options.map((o) => o.id),
    ["or-3"],
  );
});

test("confirmSourceOptions: offer and eligible draft can both appear", () => {
  const chips: RecordChip[] = [chip({ paymentState: "paid" }), { kind: "order", recordId: "or-9", label: "#9 · $48.50", paymentState: null, fulfilmentState: null }];
  const options = confirmSourceOptions(chips, [OFFER_ACCEPTED]);
  assert.equal(options.length, 2);
  assert.deepEqual(
    options.map((o) => o.source),
    ["offer", "draft"],
  );
});

test("depositGate: no option picked reads as no gate", () => {
  assert.deepEqual(depositGate(null), { due: false, paid: false, needsOverride: false });
});

test("depositGate: no payment signal at all never blocks (a null chip is not evidence of a deposit)", () => {
  const option = confirmSourceOptions([chip({ paymentState: null })], [OFFER_ACCEPTED])[0];
  assert.deepEqual(depositGate(option), { due: false, paid: false, needsOverride: false });
});

test("depositGate: unpaid reads as due and needing an override", () => {
  const option = confirmSourceOptions([chip({ paymentState: "unpaid" })], [OFFER_ACCEPTED])[0];
  assert.deepEqual(depositGate(option), { due: true, paid: false, needsOverride: true });
});

test("depositGate: paid or deposit_paid never needs an override", () => {
  for (const paymentState of ["paid", "deposit_paid"]) {
    const option = confirmSourceOptions([chip({ paymentState })], [OFFER_ACCEPTED])[0];
    assert.deepEqual(depositGate(option), { due: true, paid: true, needsOverride: false });
  }
});

test("overrideReasonValid: mirrors CONFIRM_OVERRIDE_MIN_CHARS (8)", () => {
  assert.equal(CONFIRM_OVERRIDE_MIN_CHARS, 8);
  assert.equal(overrideReasonValid("short"), false);
  assert.equal(overrideReasonValid("        "), false, "whitespace-only does not count");
  assert.equal(overrideReasonValid("long enough reason"), true);
  assert.equal(overrideReasonValid("exactly8"), true);
});

test("createdListFor: draft always creates order + kitchen ticket + receipt", () => {
  assert.deepEqual(createdListFor("draft", true), ["order", "kitchen_ticket", "receipt"]);
  assert.deepEqual(createdListFor("draft", false), ["order", "kitchen_ticket", "receipt"]);
});

test("createdListFor: offer with people also creates assignments and calendar blocks", () => {
  assert.deepEqual(createdListFor("offer", true), ["project", "assignments", "calendar_blocks", "balance_reminder", "client_confirmation"]);
});

test("createdListFor: offer with no people skips assignments and calendar blocks", () => {
  assert.deepEqual(createdListFor("offer", false), ["project", "balance_reminder", "client_confirmation"]);
});

test("checkedCategoriesFor: an offer checks people and resources, a draft only resources", () => {
  assert.deepEqual(checkedCategoriesFor("offer"), ["people", "resources"]);
  assert.deepEqual(checkedCategoriesFor("draft"), ["resources"]);
});
