import assert from "node:assert/strict";
import { test } from "node:test";

import {
  guestInquirySegment,
  guestSegmentCounts,
  guestStateLine,
  pickRecordChip,
  rowsForGuestSegment,
  showSamePersonBanner,
  type GuestInquiryRecordChip,
  type GuestInquiryRowInput,
} from "./guest-inquiries-view";

const LABELS = {
  needsReply: "Waiting on them",
  awaitingYou: "They are waiting on you",
  pay: "Payment due",
  hold: "Holding a time",
  offer: "Offer to review",
  done: "Done",
  draft: "Not sent yet",
};

function row(over: Partial<GuestInquiryRowInput> = {}): GuestInquiryRowInput {
  return {
    inquiryId: "i1",
    projectLabel: "Dinner",
    isDraft: false,
    threadStatus: "open",
    ...over,
  };
}

const orderChip = (over: Partial<GuestInquiryRecordChip> = {}): GuestInquiryRecordChip => ({
  kind: "order",
  recordId: "o1",
  paymentState: null,
  fulfilmentState: null,
  recordDate: null,
  amountCents: 1800,
  currency: "USD",
  ...over,
});

test("Needs you: staff wrote last (awaiting_customer) and an unpaid link", () => {
  assert.equal(
    guestInquirySegment(row({ conversationState: "awaiting_customer", lastMessageAuthor: "agency" })),
    "needs",
  );
  assert.equal(
    guestInquirySegment(row({ recordChip: orderChip({ paymentState: "requested" }) })),
    "needs",
  );
  assert.equal(
    guestInquirySegment(row({ opportunityState: "awaiting_acceptance", currentOfferId: "of1", lastMessageAuthor: "agency" })),
    "needs",
  );
});

test("Waiting on them: guest wrote last (needs_reply) and drafts", () => {
  assert.equal(
    guestInquirySegment(row({ conversationState: "needs_reply", lastMessageAuthor: "guest" })),
    "wait",
  );
  assert.equal(guestInquirySegment(row({ isDraft: true, threadStatus: "draft" })), "wait");
});

test("Done: resolved, closed, booked, fulfilled paid", () => {
  assert.equal(guestInquirySegment(row({ conversationState: "resolved", resolvedAt: "2026-09-18T00:00:00Z" })), "done");
  assert.equal(guestInquirySegment(row({ threadStatus: "closed" })), "done");
  assert.equal(guestInquirySegment(row({ threadStatus: "booked" })), "done");
  assert.equal(
    guestInquirySegment(row({ recordChip: orderChip({ paymentState: "paid", fulfilmentState: "fulfilled" }) })),
    "done",
  );
});

test("segments partition without double counting", () => {
  const rows = [
    row({ inquiryId: "n", conversationState: "awaiting_customer", lastMessageAuthor: "agency" }),
    row({ inquiryId: "w", conversationState: "needs_reply", lastMessageAuthor: "guest" }),
    row({ inquiryId: "d", conversationState: "resolved", resolvedAt: "2026-09-18T00:00:00Z" }),
  ];
  assert.deepEqual(guestSegmentCounts(rows), { needs: 1, wait: 1, done: 1 });
  assert.deepEqual(rowsForGuestSegment(rows, "needs").map((r) => r.inquiryId), ["n"]);
});

test("one record chip: the most meaningful live record wins, newest breaks ties; empty is null", () => {
  assert.equal(pickRecordChip([]), null);
  const a = orderChip({ recordId: "a", amountCents: 100 });
  const b = orderChip({ recordId: "b", amountCents: 500, kind: "offer" });
  // An order outranks a newer offer.
  assert.equal(pickRecordChip([a, b])?.recordId, "a");
  // Two offers: the newest wins.
  assert.equal(pickRecordChip([orderChip({ recordId: "o1", kind: "offer" }), b])?.recordId, "b");
  // A paid, confirmed order outranks an open order and an offer, whatever the order.
  const paid = orderChip({ recordId: "p", paymentState: "paid", fulfilmentState: "confirmed" });
  assert.equal(pickRecordChip([paid, a, b])?.recordId, "p");
  assert.equal(pickRecordChip([b, a, paid])?.recordId, "p");
});

test("state line is one sentence, payment beats waiting", () => {
  assert.equal(guestStateLine(row({ isDraft: true, threadStatus: "draft" }), LABELS), "Not sent yet");
  assert.equal(
    guestStateLine(row({ recordChip: orderChip({ paymentState: "opened" }), lastMessageAuthor: "agency" }), LABELS),
    "Payment due",
  );
  assert.equal(
    guestStateLine(row({ conversationState: "resolved", resolvedAt: "2026-09-18T00:00:00Z" }), LABELS),
    "Done",
  );
  assert.equal(
    guestStateLine(row({ conversationState: "needs_reply", lastMessageAuthor: "guest" }), LABELS),
    "Waiting on them",
  );
});

test("Same person? only when a placeholder name owns two open inquiries", () => {
  assert.equal(showSamePersonBanner([row({ contactName: "Guest" })]), false);
  assert.equal(
    showSamePersonBanner([
      row({ inquiryId: "a", contactName: "Guest" }),
      row({ inquiryId: "b", contactName: "Guest" }),
    ]),
    true,
  );
  assert.equal(
    showSamePersonBanner([
      row({ inquiryId: "a", contactName: "Ada" }),
      row({ inquiryId: "b", contactName: "Ada" }),
    ]),
    false,
  );
  assert.equal(
    showSamePersonBanner([
      row({ inquiryId: "a", contactName: "Guest" }),
      row({ inquiryId: "b", contactName: "Guest", conversationState: "resolved", resolvedAt: "2026-09-18T00:00:00Z" }),
    ]),
    false,
  );
});
