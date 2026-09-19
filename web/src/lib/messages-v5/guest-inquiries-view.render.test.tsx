import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";
import { GuestDockProjectsView } from "@/app/t/[profileCode]/_chat/GuestDockProjectsView";

const t = (key: string) => key;
const noop = () => {};

function summary(over: Partial<GuestInquirySummary> = {}): GuestInquirySummary {
  return {
    inquiryId: "i1",
    projectLabel: "Dinner for two",
    lineup: [],
    lineupCount: 0,
    talentProfileId: null,
    talentName: "QA",
    talentPortraitUrl: null,
    agencyName: "QA Journeys",
    lastMessagePreview: "Hi",
    lastMessageAt: "2026-09-18T12:00:00.000Z",
    lastMessageAuthor: "agency",
    unreadHint: false,
    threadStatus: "open",
    typicalReplyLabel: null,
    isDraft: false,
    contactName: "Ada",
    conversationState: "awaiting_customer",
    ...over,
  };
}

function html(inquiries: GuestInquirySummary[]) {
  return renderToStaticMarkup(
    <GuestDockProjectsView
      inquiries={inquiries}
      activeInquiryId={null}
      seenAtByInquiry={{}}
      accent="#2b8a63"
      agencyName="QA Journeys"
      t={t}
      onSelect={noop}
    />,
  );
}

test("empty Needs you: three segments and the empty sentence", () => {
  const out = html([]);
  assert.match(out, /data-guest-dock-inquiries-seg="needs"/);
  assert.match(out, /data-guest-dock-inquiries-seg="wait"/);
  assert.match(out, /data-guest-dock-inquiries-seg="done"/);
  assert.match(out, /public\.guestChat\.dockInquiriesEmptyNeeds/);
  assert.doesNotMatch(out, /data-guest-dock-same-person/);
});

test("ready Needs you row: name+time, subject, one state line, one record chip with amount", () => {
  const out = html([
    summary({
      recordChip: {
        kind: "order",
        recordId: "o1",
        paymentState: "requested",
        fulfilmentState: null,
        recordDate: null,
        amountCents: 1800,
        currency: "USD",
      },
    }),
  ]);
  assert.match(out, />Ada</);
  assert.match(out, /Dinner for two/);
  assert.match(out, /public\.guestChat\.dockInquiriesStatePay/);
  assert.match(out, /data-guest-dock-record-chip="order"/);
  assert.match(out, /\$18\.00/);
});

test("Same person? banner when two open inquiries share a placeholder name", () => {
  const out = html([
    summary({ inquiryId: "a", contactName: "Guest", conversationState: "needs_reply", lastMessageAuthor: "guest" }),
    summary({ inquiryId: "b", contactName: "Guest", conversationState: "needs_reply", lastMessageAuthor: "guest" }),
  ]);
  assert.match(out, /data-guest-dock-same-person/);
  assert.match(out, /public\.guestChat\.dockInquiriesSamePerson/);
});
