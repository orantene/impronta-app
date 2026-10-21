import assert from "node:assert/strict";
import test from "node:test";

import {
  DURATION_TOLERANCE_MINUTES,
  canJoinEntry,
  groupBlockers,
  mergeCheck,
  perTalentDifferences,
  reviewQueue,
  splitCheck,
  suggestGroups,
  type EntryListing,
} from "./entries";

const L = (over: Partial<EntryListing>): EntryListing => ({
  listingId: "l1",
  talentProfileId: "t1",
  talentName: "Ana",
  title: "Deep massage",
  categoryId: "cat-massage",
  durationMinutes: 60,
  bookingType: "request",
  priceCents: 50000,
  currency: "USD",
  entryId: null,
  talentAccepted: true,
  ...over,
});

test("tolerance is 15 minutes", () => assert.equal(DURATION_TOLERANCE_MINUTES, 15));

test("two services can group only with the same category, a duration within 15 minutes and the same booking type", () => {
  assert.deepEqual(groupBlockers(L({}), L({ listingId: "l2", durationMinutes: 75 })), []);
  assert.deepEqual(groupBlockers(L({}), L({ listingId: "l2", durationMinutes: 76 })), ["duration"]);
  assert.deepEqual(groupBlockers(L({}), L({ listingId: "l2", categoryId: "cat-yoga" })), ["category"]);
  assert.deepEqual(groupBlockers(L({}), L({ listingId: "l2", bookingType: "instant" })), ["booking_type"]);
  assert.deepEqual(groupBlockers(L({}), L({ listingId: "l2", categoryId: "x", durationMinutes: 120, bookingType: "instant" })), ["category", "duration", "booking_type"]);
});

test("a missing category or duration is a blocker, never a match", () => {
  assert.deepEqual(groupBlockers(L({ categoryId: null }), L({ listingId: "l2", categoryId: null })), ["category"]);
  assert.deepEqual(groupBlockers(L({ durationMinutes: null }), L({ listingId: "l2" })), ["duration"]);
});

test("joining an entry: compatible with every member and the whole spread stays within 15 minutes", () => {
  const members = [L({ listingId: "a", durationMinutes: 60 }), L({ listingId: "b", durationMinutes: 70 })];
  assert.deepEqual(canJoinEntry(members, L({ listingId: "c", durationMinutes: 75 })), { ok: true });
  // 45 is within 15 of 60 but 25 away from 70: chains of small steps are refused
  assert.deepEqual(canJoinEntry(members, L({ listingId: "c", durationMinutes: 45 })), { ok: false, blockers: ["duration"] });
  assert.deepEqual(canJoinEntry([], L({})), { ok: true });
  assert.deepEqual(canJoinEntry(members, L({ listingId: "a" })), { ok: false, blockers: ["already_member"] });
});

test("suggestions: only same category and booking type, only buckets within 15 minutes, only 2 or more, assigned ones left alone", () => {
  const pool = [
    L({ listingId: "a", talentProfileId: "t1", durationMinutes: 60 }),
    L({ listingId: "b", talentProfileId: "t2", talentName: "Beto", durationMinutes: 70, priceCents: 45000 }),
    L({ listingId: "c", talentProfileId: "t3", talentName: "Cris", durationMinutes: 90 }),
    L({ listingId: "d", talentProfileId: "t4", categoryId: "cat-yoga", durationMinutes: 60 }),
    L({ listingId: "e", talentProfileId: "t5", bookingType: "instant", durationMinutes: 60 }),
    L({ listingId: "f", talentProfileId: "t6", durationMinutes: 62, entryId: "already" }),
  ];
  const s = suggestGroups(pool);
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].listingIds.sort(), ["a", "b"]);
  assert.equal(s[0].categoryId, "cat-massage");
  assert.equal(s[0].bookingType, "request");
});

test("suggestions are deterministic: same input, same output, in the same order", () => {
  const pool = [L({ listingId: "b", durationMinutes: 70 }), L({ listingId: "a", durationMinutes: 60 }), L({ listingId: "z", categoryId: "y", durationMinutes: 30 }), L({ listingId: "y", categoryId: "y", durationMinutes: 30 })];
  assert.deepEqual(suggestGroups(pool), suggestGroups([...pool].reverse()));
});

test("differences per talent show only what differs: price, duration, title", () => {
  const d = perTalentDifferences([
    L({ listingId: "a", talentName: "Ana", priceCents: 50000, durationMinutes: 60 }),
    L({ listingId: "b", talentProfileId: "t2", talentName: "Beto", priceCents: 45000, durationMinutes: 60, title: "Deep massage" }),
  ]);
  assert.deepEqual(d.map((x) => x.field), ["price"]);
  assert.deepEqual(d[0].values, [{ talentName: "Ana", value: 50000 }, { talentName: "Beto", value: 45000 }]);
  assert.deepEqual(perTalentDifferences([L({})]), []);
});

test("review queue: what talents accepted and no entry holds yet; the best existing group is offered", () => {
  const entries = [{ entryId: "e1", listings: [L({ listingId: "m1", entryId: "e1", durationMinutes: 60 })] }];
  const q = reviewQueue(
    [
      L({ listingId: "n1", talentProfileId: "t2", durationMinutes: 65 }),
      L({ listingId: "n2", talentProfileId: "t3", categoryId: "cat-yoga" }),
      L({ listingId: "waiting", talentAccepted: false }),
      L({ listingId: "m1", entryId: "e1" }),
    ],
    entries,
  );
  assert.deepEqual(q.map((i) => i.listing.listingId), ["n1", "n2"]);
  assert.deepEqual(q[0].joinableEntryIds, ["e1"]);
  assert.deepEqual(q[1].joinableEntryIds, []);
  // every item can always become a new entry or be skipped
  assert.deepEqual(q[1].options, ["new_entry", "skip"]);
  assert.deepEqual(q[0].options, ["accept_into_group", "new_entry", "skip"]);
});

test("merge: allowed only when every member of both is compatible and the spread holds", () => {
  const a = [L({ listingId: "a", durationMinutes: 60 })];
  const b = [L({ listingId: "b", talentProfileId: "t2", durationMinutes: 70 })];
  assert.deepEqual(mergeCheck(a, b), { ok: true });
  assert.deepEqual(mergeCheck(a, [L({ listingId: "b", talentProfileId: "t2", durationMinutes: 120 })]), { ok: false, blockers: ["duration"] });
  assert.deepEqual(mergeCheck([], b), { ok: false, blockers: ["empty"] });
});

test("split: both sides must keep at least one service, and the ids must belong to the entry", () => {
  const members = [L({ listingId: "a" }), L({ listingId: "b", talentProfileId: "t2" }), L({ listingId: "c", talentProfileId: "t3" })];
  assert.deepEqual(splitCheck(members, ["c"]), { ok: true, keep: ["a", "b"], out: ["c"] });
  assert.deepEqual(splitCheck(members, ["a", "b", "c"]), { ok: false, reason: "nothing_left" });
  assert.deepEqual(splitCheck(members, []), { ok: false, reason: "nothing_to_split" });
  assert.deepEqual(splitCheck(members, ["zzz"]), { ok: false, reason: "not_a_member" });
});
