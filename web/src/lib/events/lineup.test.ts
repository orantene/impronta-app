import assert from "node:assert/strict";
import test from "node:test";

import {
  crossListing,
  resolveLineupState,
  isPubliclyVisible,
  openSlots,
  publicLineup,
  staffLineup,
  type EventForLineup,
  type LineupEntry,
} from "./lineup";

const NOW = "2026-09-10T12:00:00.000Z";

function ev(over: Partial<EventForLineup> = {}): EventForLineup {
  return {
    id: "ev-1",
    status: "published",
    startsAt: "2026-09-13T21:00:00.000Z",
    setTimesPublic: true,
    ...over,
  };
}

function entry(over: Partial<LineupEntry> = {}): LineupEntry {
  return {
    inquiryId: "inq-1",
    talentProfileId: "tal-1",
    displayName: "DJ Malú",
    state: "booked",
    sortOrder: 0,
    setStartsAt: "2026-09-13T21:00:00.000Z",
    setEndsAt: "2026-09-13T23:00:00.000Z",
    ...over,
  };
}

test("the lineup axis is DERIVED from two enums, and the common row is the trap", () => {
  // The most common row a venue will have: a performer still `invited` as a
  // PARTICIPANT on an inquiry whose own status is `booked` -- the DJ you invited,
  // on the booking you closed. Sorting one enum against the other has no defined
  // answer for it; deriving does.
  assert.equal(resolveLineupState({ participantStatus: "invited", inquiryStatus: "booked" }), "booked");

  // The inquiry wins where it is decisive: it is a fact about the ENGAGEMENT,
  // while a participant status is a fact about a person's place in a conversation.
  assert.equal(resolveLineupState({ participantStatus: "active", inquiryStatus: "rejected" }), "declined");
  assert.equal(resolveLineupState({ participantStatus: "invited", inquiryStatus: "expired" }), "cancelled");

  // Terminal on the person, when the engagement is not decisive.
  assert.equal(resolveLineupState({ participantStatus: "declined", inquiryStatus: "coordination" }), "declined");
  assert.equal(resolveLineupState({ participantStatus: "removed", inquiryStatus: "coordination" }), "cancelled");

  // A live negotiation.
  assert.equal(resolveLineupState({ inquiryStatus: "offer_pending" }), "negotiating");
  assert.equal(resolveLineupState({ participantStatus: "active", inquiryStatus: "coordination" }), "negotiating");

  // UNKNOWN RESOLVES TO `invited`, NEVER `booked`. `booked` is the only value
  // that publishes a performer's name, so guessing it wrong announces somebody
  // who has not agreed -- the one failure in this file that harms a real person.
  assert.equal(resolveLineupState({}), "invited");
  assert.equal(resolveLineupState({ inquiryStatus: "some_future_status" }), "invited");
  assert.equal(resolveLineupState({ participantStatus: "who_knows" }), "invited");
});

test("only a CONFIRMED booking is public — a negotiation is not an announcement", () => {
  const e = ev();
  assert.equal(isPubliclyVisible(entry({ state: "booked" }), e), true);

  // Publishing these announces an act that has not agreed: it damages their
  // leverage on a fee still being discussed, and their reputation if it falls
  // through. Neither is recoverable once a search engine has it.
  assert.equal(isPubliclyVisible(entry({ state: "invited" }), e), false);
  assert.equal(isPubliclyVisible(entry({ state: "negotiating" }), e), false);
  assert.equal(isPubliclyVisible(entry({ state: "declined" }), e), false);
  assert.equal(isPubliclyVisible(entry({ state: "cancelled" }), e), false);
});

test("a draft or cancelled event publishes nobody, whatever the bookings say", () => {
  const booked = entry({ state: "booked" });
  assert.equal(isPubliclyVisible(booked, ev({ status: "draft" })), false);
  assert.equal(isPubliclyVisible(booked, ev({ status: "cancelled" })), false);
  assert.deepEqual(publicLineup([booked], ev({ status: "draft" })), []);
});

test("hidden set times strip the TIME, they do not hide the act", () => {
  const e = ev({ setTimesPublic: false });
  const out = publicLineup([entry()], e);

  assert.equal(out.length, 1, "the act is still announced — that is the poster");
  assert.equal(out[0]?.setStartsAt, null);
  assert.equal(out[0]?.setEndsAt, null);
  // A wrong time is worse than no time: people plan an evening around it.
  assert.equal(out[0]?.displayName, "DJ Malú");
});

test("the public lineup is running order, and negotiations never appear in it", () => {
  const out = publicLineup(
    [
      entry({ inquiryId: "c", displayName: "Sofía Rey", sortOrder: 2 }),
      entry({ inquiryId: "a", displayName: "DJ Malú", sortOrder: 0 }),
      entry({ inquiryId: "b", displayName: "Orquesta Caribe", sortOrder: 1 }),
      entry({ inquiryId: "x", displayName: "Unconfirmed Act", sortOrder: 0, state: "negotiating" }),
    ],
    ev(),
  );
  assert.deepEqual(out.map((e) => e.displayName), ["DJ Malú", "Orquesta Caribe", "Sofía Rey"]);
});

test("cross-listing onto a PERFORMER'S page is stricter than the event page", () => {
  // The event page is the venue's own surface and the venue chose to announce.
  // The performer's page belongs to somebody else, so a show on it is a claim
  // about them made by a third party.
  const listed = crossListing(entry(), ev(), NOW);
  assert.deepEqual(listed, { listed: true, upcoming: true });

  assert.deepEqual(crossListing(entry({ state: "negotiating" }), ev(), NOW),
    { listed: false, reason: "not_public" });
  assert.deepEqual(crossListing(entry(), ev({ status: "draft" }), NOW),
    { listed: false, reason: "not_public" });

  // An off-platform act typed in by hand is common and there is nowhere to
  // cross-list it. A refusal, not a failure.
  assert.deepEqual(crossListing(entry({ talentProfileId: null }), ev(), NOW),
    { listed: false, reason: "no_profile" });

  assert.deepEqual(crossListing(entry(), ev({ startsAt: null }), NOW),
    { listed: false, reason: "no_date" });
});

test("a past show stays on a performer's page as history, but is not upcoming", () => {
  // It is evidence they work. It must not sit in a "coming up" rail for ever.
  const past = crossListing(entry(), ev(), "2026-09-20T12:00:00.000Z");
  assert.deepEqual(past, { listed: true, upcoming: false });
});

test("the staff view puts unanswered invitations first, not confirmed acts", () => {
  const out = staffLineup([
    entry({ inquiryId: "1", displayName: "Booked Act", state: "booked", sortOrder: 0 }),
    entry({ inquiryId: "2", displayName: "Declined Act", state: "declined", sortOrder: 0 }),
    entry({ inquiryId: "3", displayName: "Invited Act", state: "invited", sortOrder: 5 }),
    entry({ inquiryId: "4", displayName: "Quoted Act", state: "negotiating", sortOrder: 9 }),
  ]);

  // An invitation with no reply is the entry most likely to be forgotten, and a
  // show with an unfilled slot two days out is what this tab exists to prevent.
  // Sort order is a display preference and loses to that.
  assert.deepEqual(out.map((e) => e.displayName),
    ["Invited Act", "Quoted Act", "Booked Act", "Declined Act"]);

  assert.equal(openSlots(out), 2);
  assert.equal(openSlots([entry({ state: "booked" })]), 0);
});
