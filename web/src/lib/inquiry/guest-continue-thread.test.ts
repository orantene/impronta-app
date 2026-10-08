import assert from "node:assert/strict";
import { test } from "node:test";

import { pickContinuableInquiry, type ContinuableRow } from "./guest-continue-thread";

const row = (id: string, status: string, createdAt: string, talents: string[] = []): ContinuableRow => ({
  id,
  status,
  createdAt,
  talentProfileIds: talents,
});

test("no open thread: nothing to continue (the cap still blocks a new one)", () => {
  assert.equal(pickContinuableInquiry([], "t1"), null);
  assert.equal(
    pickContinuableInquiry([row("a", "closed", "2026-01-01"), row("b", "cancelled", "2026-01-02")], "t1"),
    null,
  );
});

test("a private draft is not continued here (it has its own promote-then-send path)", () => {
  assert.equal(pickContinuableInquiry([row("a", "draft", "2026-01-01")], "t1"), null);
});

test("the one open conversation is continued", () => {
  assert.equal(pickContinuableInquiry([row("a", "submitted", "2026-01-01")], "t1"), "a");
});

test("prefers the thread that already names this talent, else the newest", () => {
  const rows = [
    row("old-same", "submitted", "2026-01-01", ["t1"]),
    row("new-other", "submitted", "2026-02-01", ["t2"]),
  ];
  assert.equal(pickContinuableInquiry(rows, "t1"), "old-same");
  assert.equal(pickContinuableInquiry(rows, "t9"), "new-other");
  assert.equal(pickContinuableInquiry(rows, null), "new-other");
});

test("booked and approved threads stay continuable", () => {
  assert.equal(pickContinuableInquiry([row("a", "booked", "2026-01-01")], "t1"), "a");
});
