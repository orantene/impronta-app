import { test } from "node:test";
import assert from "node:assert/strict";
import { selectTalentOfferView } from "./talent-offer-view";

test("pending approval on a sent offer shows the approve/reject buttons", () => {
  assert.equal(selectTalentOfferView({ stage: "hold", myApprovalStatus: "pending", hasSentOffer: false }), "approve_pending");
  assert.equal(selectTalentOfferView({ stage: "inquiry", myApprovalStatus: "pending", hasSentOffer: true }), "approve_pending");
});

test("accepted shows the approved badge, rejected shows declined", () => {
  assert.equal(selectTalentOfferView({ stage: "hold", myApprovalStatus: "accepted", hasSentOffer: true }), "approved");
  assert.equal(selectTalentOfferView({ stage: "hold", myApprovalStatus: "rejected", hasSentOffer: true }), "rejected");
});

test("no sent offer falls back to the draft CTA", () => {
  assert.equal(selectTalentOfferView({ stage: "inquiry", myApprovalStatus: "pending", hasSentOffer: false }), "draft_cta");
  assert.equal(selectTalentOfferView({ stage: "hold", myApprovalStatus: null, hasSentOffer: true }), "draft_cta");
  assert.equal(selectTalentOfferView({ stage: "inquiry", myApprovalStatus: undefined, hasSentOffer: false }), "draft_cta");
});
