import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildOfferLineConfirmationView, confirmationSummaryText } from "./offer-line-confirmation-view";

const lines = [
  { id: "l1", kind: "talent" as const, talentProfileId: "p1", label: "Ana" },
  { id: "l2", kind: "talent" as const, talentProfileId: "p2", label: "Luis" },
  { id: "l3", kind: "talent" as const, talentProfileId: "p3", label: "Mia" },
  { id: "h", kind: "house" as const, talentProfileId: null, label: "Venue" },
];
const read = {
  ok: true as const,
  answers: [
    { lineId: "l1", talentProfileId: "p1", status: "confirmed" as const },
    { lineId: "l2", talentProfileId: "p2", status: "declined" as const },
  ],
};

test("coordinator sees every talent line with its own state and a count", () => {
  const v = buildOfferLineConfirmationView({ lines, read, viewer: { manager: true, ownProfileIds: [] } });
  assert.deepEqual(v.rows.map((r) => [r.lineId, r.state]), [["l1", "confirmed"], ["l2", "declined"], ["l3", "pending"]]);
  assert.deepEqual(v.summary, { confirmed: 1, total: 3 });
  assert.ok(v.rows.every((r) => !r.mine));
});

test("a talent gets rows and buttons only for their own line, never another person's", () => {
  const v = buildOfferLineConfirmationView({ lines, read, viewer: { manager: false, ownProfileIds: ["p3"] } });
  assert.deepEqual(v.rows.map((r) => r.lineId), ["l3"]);
  assert.equal(v.rows[0].mine, true);
  assert.deepEqual(v.summary, { confirmed: 1, total: 3 });
});

test("an unreadable answer table is Awaiting, never Confirmed", () => {
  const v = buildOfferLineConfirmationView({ lines, read: { ok: false }, viewer: { manager: true, ownProfileIds: [] } });
  assert.ok(v.rows.every((r) => r.state === "pending"));
  assert.equal(v.summary.confirmed, 0);
});

test("a manager who is also on a line gets buttons for that line only", () => {
  const v = buildOfferLineConfirmationView({ lines, read, viewer: { manager: true, ownProfileIds: ["p2"] } });
  assert.deepEqual(v.rows.filter((r) => r.mine).map((r) => r.lineId), ["l2"]);
});

test("summary text is bilingual", () => {
  assert.equal(confirmationSummaryText({ confirmed: 3, total: 4 }, "en"), "3 of 4 confirmed");
  assert.equal(confirmationSummaryText({ confirmed: 3, total: 4 }, "es"), "3 de 4 confirmados");
  assert.equal(confirmationSummaryText({ confirmed: 0, total: 0 }, "en"), "");
});

test("the component is wired into the offer panel, uses tokens only, and has ES + EN copy", () => {
  const comp = readFileSync("src/components/admin/shell/internal/messages/shared/offer-line-confirmations.tsx", "utf8");
  assert.ok(!/style=\{/.test(comp), "no inline styles under admin/shell");
  assert.ok(/min-h-11/.test(comp), "44px targets");
  assert.ok(/answerMyOfferLineAction/.test(comp));
  const panel = readFileSync("src/components/admin/shell/internal/messages/shared/machinery-12.tsx", "utf8");
  assert.ok(/<OfferLineConfirmations /.test(panel));
  for (const lang of ["en", "es"]) {
    const json = JSON.parse(readFileSync(`messages/${lang}.json`, "utf8"));
    const lc = json.dashboard.adminTabs.offer.lineConfirm;
    for (const k of ["summary", "confirm", "decline"]) assert.ok(typeof lc[k] === "string" && !lc[k].includes("—"));
    for (const k of ["confirmed", "declined", "pending"]) assert.ok(typeof lc.state[k] === "string");
  }
});

test("an unreadable read is flagged not readable, so the UI shows nothing instead of 0 of N", () => {
  const bad = buildOfferLineConfirmationView({ lines, read: { ok: false }, viewer: { manager: true, ownProfileIds: [] } });
  assert.equal(bad.readable, false);
  const good = buildOfferLineConfirmationView({ lines, read, viewer: { manager: true, ownProfileIds: [] } });
  assert.equal(good.readable, true);
  const action = readFileSync("src/lib/server-actions/offer-line-confirmation.ts", "utf8");
  assert.ok(/!read\.ok\) return \{ ok: false/.test(action), "the action returns no view when answers are unreadable");
  const comp = readFileSync("src/components/admin/shell/internal/messages/shared/offer-line-confirmations.tsx", "utf8");
  assert.ok(/!view\.readable/.test(comp));
  assert.ok(/role="alert"/.test(comp) && /lineConfirm\.saveFailed/.test(comp), "a failed save is visible");
  for (const lang of ["en", "es"]) {
    const json = JSON.parse(readFileSync(`messages/${lang}.json`, "utf8"));
    assert.ok(json.dashboard.adminTabs.offer.lineConfirm.saveFailed);
  }
});

test("the talent surface mounts the confirmations beside the approval card, and the coordinator panel still does", () => {
  const panel = readFileSync("src/components/admin/shell/internal/messages/shared/machinery-12.tsx", "utf8");
  const mounts = panel.match(/<OfferLineConfirmations /g) ?? [];
  assert.ok(mounts.length >= 4, `expected coordinator + 3 talent mounts, found ${mounts.length}`);
  const cards = [...panel.matchAll(/<TalentOfferApprovalCard [^>]*\/>\s*<OfferLineConfirmations inquiryId=\{conv\.id\} \/>/g)];
  assert.equal(cards.length, 2, "both talent approval-card branches mount it");
  assert.ok(/<LiveOfferPanel/.test(panel) && /status !== "draft" && <OfferLineConfirmations inquiryId=\{inquiryId\} offerId=\{offerId\}/.test(panel));
  const action = readFileSync("src/lib/server-actions/offer-line-confirmation.ts", "utf8");
  assert.ok(/current_offer_id/.test(action) && /status === "draft"/.test(action), "talent passes no offer id; drafts are never shown");
});

test("approval and money code paths never import or read the confirmation model", () => {
  const files = [
    "src/lib/server-actions/client-pipeline.ts",
    "src/lib/messaging/accept-offer-payment.ts",
    "src/lib/payments/booking-confirmation.ts",
    "src/lib/inquiry/inquiry-engine-offers.ts",
    "src/lib/inquiry/inquiry-engine-booking.ts",
    "src/lib/coordinator/offer-role-views.ts",
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/offer-line-confirmation|offer_line_confirmations|offerConfirmation/.test(src), `${f} must not read the confirmation model`);
  }
});

test("defence in depth: identity (manager guard + own profiles) comes BEFORE any service-role read of the offer or its lines", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/offer-line-confirmation.ts"), "utf8");
  const view = src.slice(src.indexOf("export async function loadOfferLineConfirmationViewAction"));
  const guard = view.indexOf("requireInquiryManagerAction(");
  const mine = view.indexOf('from("talent_profiles")');
  const bail = view.indexOf("ownProfileIds.length === 0");
  const offers = view.indexOf('from("inquiry_offers")');
  const inquiries = view.indexOf('from("inquiries")');
  const lines = view.indexOf('from("inquiry_offer_line_items")');
  assert.ok(guard > -1 && mine > -1 && bail > -1);
  for (const read of [offers, inquiries, lines]) {
    assert.ok(read > bail, "a non-participant is turned away before this read");
    assert.ok(read > guard && read > mine);
  }
  // The guard is not re-run later in parallel with the lines read.
  assert.equal(view.split("requireInquiryManagerAction(").length - 1, 1);
});
