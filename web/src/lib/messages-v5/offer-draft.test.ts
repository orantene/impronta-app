import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addCustomLine,
  draftDepositCents,
  draftLineCount,
  draftPlatformFeeCents,
  draftTalentNetCents,
  draftTotalCents,
  emptyTerms,
  lineTotalCents,
  removeLine,
  restoreLine,
  setDepositAmountCents,
  setDepositPct,
  setLineDiscount,
  setLinePriceCents,
  setLineTax,
  setLineUnits,
  setNoteToClient,
  setValidUntil,
  toOfferLineDrafts,
  type OfferDraftLine,
  type OfferDraftState,
} from "./offer-draft";

function talentLine(over: Partial<OfferDraftLine> = {}): OfferDraftLine {
  return {
    id: "l1",
    kind: "talent",
    talentProfileId: "tp1",
    ownerTenantId: null,
    label: "DJ set",
    pricingUnit: "hour",
    units: 2,
    unitPriceCents: 10000,
    talentCostCents: 15000,
    note: null,
    sortOrder: 0,
    sourceServiceId: null,
    proposedBy: "staff",
    proposedByName: null,
    confirmed: false,
    priceSnapshotCents: null,
    catalogPriceCentsAtAdd: null,
    catalogNowCents: null,
    discountCents: 0,
    discountLabel: null,
    taxCents: 0,
    taxLabel: null,
    removedBy: null,
    ...over,
  };
}

function baseState(lines: OfferDraftLine[] = []): OfferDraftState {
  return {
    offerId: "offer1",
    inquiryId: "inq1",
    version: 1,
    inquiryExpectedVersion: 1,
    status: "draft",
    currencyCode: "USD",
    lines,
    terms: emptyTerms(),
    coordinatorFeeCents: 2000,
  };
}

test("lineTotalCents: units x price, minus discount, plus tax, never negative", () => {
  const l = talentLine({ units: 2, unitPriceCents: 10000, discountCents: 5000, taxCents: 300 });
  assert.equal(lineTotalCents(l), 2 * 10000 - 5000 + 300);
  const overDiscounted = talentLine({ units: 1, unitPriceCents: 1000, discountCents: 5000 });
  assert.equal(lineTotalCents(overDiscounted), 0);
});

test("draftTotalCents excludes removed lines; draftLineCount too", () => {
  const kept = talentLine({ id: "l1", units: 1, unitPriceCents: 10000 });
  const removed = talentLine({ id: "l2", units: 1, unitPriceCents: 5000, removedBy: "Ana" });
  const state = baseState([kept, removed]);
  assert.equal(draftTotalCents(state), 10000);
  assert.equal(draftLineCount(state), 1);
});

test("restoreLine un-removes a line and it counts again", () => {
  const removed = talentLine({ id: "l2", removedBy: "Ana" });
  let state = baseState([removed]);
  assert.equal(draftLineCount(state), 0);
  state = restoreLine(state, "l2");
  assert.equal(draftLineCount(state), 1);
});

test("removeLine keeps the line (restorable), stamped with who removed it", () => {
  const state = removeLine(baseState([talentLine()]), "l1", "Ana");
  assert.equal(state.lines[0]?.removedBy, "Ana");
  assert.equal(draftLineCount(state), 0);
});

test("draftDepositCents: pct mode derives from the total; amount mode is literal; none is null", () => {
  const state = baseState([talentLine({ units: 1, unitPriceCents: 100000 })]);
  assert.equal(draftDepositCents(state), null);
  assert.equal(draftDepositCents(setDepositPct(state, 30)), 30000);
  assert.equal(draftDepositCents(setDepositAmountCents(state, 12345)), 12345);
  assert.equal(draftDepositCents(setDepositAmountCents(state, null)), null);
});

test("draftTalentNetCents sums live lines' talentCostCents only", () => {
  const state = baseState([
    talentLine({ id: "l1", talentCostCents: 15000 }),
    talentLine({ id: "l2", talentCostCents: 5000, removedBy: "Ana" }),
  ]);
  assert.equal(draftTalentNetCents(state), 15000);
});

test("draftPlatformFeeCents is total minus talent net minus coordinator fee, floored at 0", () => {
  const state = baseState([talentLine({ units: 1, unitPriceCents: 100000, talentCostCents: 70000 })]);
  // total 100000, talent 70000, coordinatorFee 2000 (from baseState) -> 28000
  assert.equal(draftPlatformFeeCents(state), 28000);
  const overCommitted = { ...state, coordinatorFeeCents: 100000 };
  assert.equal(draftPlatformFeeCents(overCommitted), 0);
});

test("addCustomLine appends a staff-authored, unconfirmed, zero-talent-cost line", () => {
  const state = addCustomLine(baseState(), { label: "Setup fee", units: 1, unitPriceCents: 5000 });
  assert.equal(state.lines.length, 1);
  const l = state.lines[0]!;
  assert.equal(l.kind, "custom");
  assert.equal(l.label, "Setup fee");
  assert.equal(l.proposedBy, "staff");
  assert.equal(l.talentCostCents, 0);
  assert.equal(l.confirmed, false);
});

test("setLineUnits / setLinePriceCents / setLineDiscount / setLineTax never go negative", () => {
  let state = baseState([talentLine()]);
  state = setLineUnits(state, "l1", -3);
  assert.equal(state.lines[0]?.units, 0);
  state = setLinePriceCents(state, "l1", -100);
  assert.equal(state.lines[0]?.unitPriceCents, 0);
  state = setLineDiscount(state, "l1", -50, "promo");
  assert.equal(state.lines[0]?.discountCents, 0);
  assert.equal(state.lines[0]?.discountLabel, "promo");
  state = setLineTax(state, "l1", -50, "VAT");
  assert.equal(state.lines[0]?.taxCents, 0);
});

test("setValidUntil / setNoteToClient update terms only", () => {
  let state = baseState();
  state = setValidUntil(state, "2026-10-01");
  assert.equal(state.terms.validUntil, "2026-10-01");
  state = setNoteToClient(state, "Thanks for choosing us");
  assert.equal(state.terms.noteToClient, "Thanks for choosing us");
});

test("toOfferLineDrafts round-trips cents to dollars and drops removed lines", () => {
  const state = baseState([
    talentLine({ id: "l1", units: 2, unitPriceCents: 10000, talentCostCents: 15000, discountCents: 1000, taxCents: 200 }),
    talentLine({ id: "l2", removedBy: "Ana" }),
  ]);
  const drafts = toOfferLineDrafts(state);
  assert.equal(drafts.length, 1);
  const d = drafts[0]!;
  assert.equal(d.unit_price, 100);
  assert.equal(d.talent_cost, 150);
  assert.equal(d.total_price, (2 * 10000 - 1000 + 200) / 100);
  assert.equal(d.discount_cents, 1000);
  assert.equal(d.tax_cents, 200);
  assert.equal(d.talent_profile_id, "tp1");
});
