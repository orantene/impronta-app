import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { selectTalentOfferView } from "./talent-offer-view";

// TUL-317 follow-up: visibility and double-submit guarantees for the card.
const card = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/messages/shared/talent-offer-approval-card.tsx"), "utf8");
const buttonsShown = (v: ReturnType<typeof selectTalentOfferView>) => v === "approve_pending";

test("only the talent whose approval is pending sees Approve/Decline", () => {
  const sent = { stage: "hold", hasSentOffer: true } as const;
  // Talent A pending; talent B / coordinator with no approval row get null.
  assert.equal(buttonsShown(selectTalentOfferView({ ...sent, myApprovalStatus: "pending" })), true);
  assert.equal(buttonsShown(selectTalentOfferView({ ...sent, myApprovalStatus: null })), false);
  assert.equal(buttonsShown(selectTalentOfferView({ ...sent, myApprovalStatus: undefined })), false);
  assert.equal(buttonsShown(selectTalentOfferView({ ...sent, myApprovalStatus: "accepted" })), false);
  assert.equal(buttonsShown(selectTalentOfferView({ ...sent, myApprovalStatus: "rejected" })), false);
});

test("the Oferta tab only asks for the card when the viewer is a talent with a real inquiry", () => {
  const tab = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/messages/shared/machinery-12.tsx"), "utf8");
  assert.match(tab, /isTalent && realInquiryId\s*\?\s*selectTalentOfferView\(/);
});

test("card buttons disable while a response is in flight (no double submit)", () => {
  assert.match(card, /useTransition\(\)/);
  const approve = card.match(/<button[^>]*onClick=\{\(\) => respond\("accepted"\)\}/);
  const decline = card.match(/<button[^>]*onClick=\{\(\) => respond\("rejected"\)\}/);
  assert.ok(approve && decline);
  assert.match(approve![0], /disabled=\{pending\}/);
  assert.match(decline![0], /disabled=\{pending\}/);
});

test("recorded approvals render the state, never the buttons", () => {
  assert.match(card, /view === "approve_pending" && \(/);
  assert.equal((card.match(/<button/g) ?? []).length, 2);
  assert.match(card, /offerCardApprovedTitle/);
  assert.match(card, /offerCardDeclinedTitle/);
  assert.match(card, /data-view=\{view\}/);
});
