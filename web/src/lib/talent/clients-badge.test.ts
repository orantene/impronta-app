import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clientBadgeFor, showClientsCountLine } from "./clients-directory";

const NOW = Date.parse("2026-10-07T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("clientBadgeFor", () => {
  it("new: first seen within 14 days and nothing completed", () => {
    assert.equal(clientBadgeFor({ firstSeenAt: daysAgo(3), completedCount: 0 }, NOW), "new");
    assert.equal(clientBadgeFor({ firstSeenAt: daysAgo(14), completedCount: 0 }, NOW), "new");
  });
  it("no badge once older than 14 days", () => {
    assert.equal(clientBadgeFor({ firstSeenAt: daysAgo(15), completedCount: 0 }, NOW), null);
  });
  it("no badge with completed work, however recent", () => {
    assert.equal(clientBadgeFor({ firstSeenAt: daysAgo(1), completedCount: 1 }, NOW), null);
  });
  it("no claim without a usable date", () => {
    assert.equal(clientBadgeFor({ firstSeenAt: null, completedCount: 0 }, NOW), null);
    assert.equal(clientBadgeFor({ firstSeenAt: undefined, completedCount: 0 }, NOW), null);
    assert.equal(clientBadgeFor({ firstSeenAt: "garbage", completedCount: 0 }, NOW), null);
  });
});

describe("showClientsCountLine", () => {
  it("hides the line that repeats the subtitle", () => {
    assert.equal(showClientsCountLine({ visible: 26, total: 26, filter: "all", query: "" }), false);
  });
  it("shows it when narrowed by filter, search or the refill note", () => {
    assert.equal(showClientsCountLine({ visible: 3, total: 26, filter: "upcoming", query: "" }), true);
    assert.equal(showClientsCountLine({ visible: 26, total: 26, filter: "all", query: "ana" }), true);
    assert.equal(showClientsCountLine({ visible: 26, total: 26, filter: "follow", query: "" }), true);
  });
});
