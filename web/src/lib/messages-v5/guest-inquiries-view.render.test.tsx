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

test("empty Yours: no filter segments, DoR empty sentence", () => {
  const out = html([]);
  assert.doesNotMatch(out, /data-guest-dock-inquiries-seg=/);
  assert.match(out, /data-guest-dock-yours-empty/);
  assert.match(out, /public\.guestChat\.dockInquiriesEmpty/);
  assert.doesNotMatch(out, /data-guest-dock-same-person/);
});

test("Yours card: project title + status pill + state line (no Needs you filters)", () => {
  const out = html([
    summary({
      projectLabel: "Lumina lineup",
      conversationState: "needs_reply",
      lastMessageAuthor: "guest",
    }),
  ]);
  assert.doesNotMatch(out, /data-guest-dock-inquiries-seg=/);
  assert.match(out, /Lumina lineup/);
  assert.match(out, /data-guest-dock-yours-pill="awaiting"/);
  assert.match(out, /data-guest-dock-status-pill="awaiting"/);
  assert.match(out, /public\.guestChat\.dockYoursPillAwaiting/);
  assert.match(out, /public\.guestChat\.dockInquiriesStateWaiting/);
  assert.doesNotMatch(out, /data-guest-dock-record-chip=/);
});

test("Yours pills across Draft / Replied / Offer / Booked", () => {
  const out = html([
    summary({ inquiryId: "d", projectLabel: "Wedding package", isDraft: true, threadStatus: "draft", conversationState: null, lastMessageAuthor: null }),
    summary({ inquiryId: "r", projectLabel: "Berni + Morena", conversationState: "awaiting_customer", lastMessageAuthor: "agency" }),
    summary({
      inquiryId: "o",
      projectLabel: "Offer row",
      opportunityState: "awaiting_acceptance",
      currentOfferId: "of1",
      lastMessageAuthor: "agency",
    }),
    summary({ inquiryId: "b", projectLabel: "Tulum Saturday", threadStatus: "booked" }),
  ]);
  assert.match(out, /data-guest-dock-yours-pill="draft"/);
  assert.match(out, /data-guest-dock-yours-pill="replied"/);
  assert.match(out, /data-guest-dock-yours-pill="offer"/);
  assert.match(out, /data-guest-dock-yours-pill="booked"/);
});

test("Same person? banner when two open inquiries share a placeholder name", () => {
  const out = html([
    summary({ inquiryId: "a", contactName: "Guest", conversationState: "needs_reply", lastMessageAuthor: "guest" }),
    summary({ inquiryId: "b", contactName: "Guest", conversationState: "needs_reply", lastMessageAuthor: "guest" }),
  ]);
  assert.match(out, /data-guest-dock-same-person/);
  assert.match(out, /public\.guestChat\.dockInquiriesSamePerson/);
});
