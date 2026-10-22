import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectTalentOfferView, shouldMountLineConfirmations } from "./talent-offer-view";

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

test("TUL-1607: the line panel mounts for a real inquiry even with no approval row and no live offer", () => {
  assert.equal(shouldMountLineConfirmations("c1f30000-0000-4000-8000-0000000000f0"), true);
  assert.equal(shouldMountLineConfirmations(null), false);
  assert.equal(shouldMountLineConfirmations(undefined), false);
});

test("TUL-1607: the talent stub mounts the panel through that rule, not behind hasOffer", () => {
  const src = readFileSync(new URL("./machinery-12.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("shouldMountLineConfirmations(realInquiryId) && <OfferLineConfirmations"));
  assert.ok(!src.includes("hasOffer && realInquiryId && <OfferLineConfirmations"));
});
