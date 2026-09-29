import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProfileEditorSections,
  reviewMatchesTab,
  reviewSourceKind,
  reviewTabCounts,
  summarizeEligibility,
} from "./profile-editor-sections";
import { getWebsiteEligibility } from "./website-eligibility";

const partial = getWebsiteEligibility({
  hasNameAndWork: true,
  photoCount: 24,
  bookableCount: 22,
  hasIntro: false,
  hasAvailability: false,
  hasPlace: null,
  workingMode: "bookings",
});

describe("buildProfileEditorSections", () => {
  it("maps eligibility slices onto editor sections", () => {
    const s = buildProfileEditorSections(partial.slices);
    const by = Object.fromEntries(s.map((x) => [x.key, x.state]));
    assert.equal(by.nameTrade, "done");
    assert.equal(by.photos, "done");
    assert.equal(by.intro, "todo");
    assert.equal(by.where, "unknown");
    assert.equal(by.languages, "optional");
    assert.equal(by.contact, "optional");
    assert.deepEqual(s.map((x) => x.key), ["nameTrade", "intro", "where", "photos", "languages", "contact"]);
  });
});

describe("summarizeEligibility", () => {
  it("counts open required slices and keeps the one percent", () => {
    const sum = summarizeEligibility(partial);
    assert.equal(sum.percent, partial.percent);
    assert.equal(sum.left, 2); // intro + when (where is unknown)
    assert.equal(sum.firstOpen, "intro");
  });
});

describe("review tabs", () => {
  const rows = [
    { id: "a", status: "published" as const, replyBody: null, bookingId: "b1" },
    { id: "b", status: "published" as const, replyBody: "thanks", bookingId: null },
    { id: "c", status: "hidden" as const, replyBody: null, bookingId: "b2" },
  ];
  it("counts each tab", () => {
    assert.deepEqual(reviewTabCounts(rows), { all: 3, needReply: 1, replied: 1, flagged: 1 });
  });
  it("respects local reports and replies", () => {
    const counts = reviewTabCounts(rows, new Set(["a"]), new Set(["a"]));
    assert.deepEqual(counts, { all: 3, needReply: 0, replied: 2, flagged: 2 });
    assert.equal(reviewMatchesTab(rows[0], "flagged", new Set(["a"])), true);
  });
  it("labels the source", () => {
    assert.equal(reviewSourceKind(rows[0]), "verified");
    assert.equal(reviewSourceKind(rows[1]), "noBooking");
  });
});
