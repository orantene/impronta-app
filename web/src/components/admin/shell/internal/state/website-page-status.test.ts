import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveWebsitePageStatus } from "./website-page-status";

const NOW = Date.parse("2026-08-15T12:00:00.000Z");
const FUTURE = "2026-08-16T12:00:00.000Z";
const PAST = "2026-08-14T12:00:00.000Z";

test("future scheduled_publish_at on a draft page reads as scheduled", () => {
  assert.equal(deriveWebsitePageStatus("draft", FUTURE, NOW), "scheduled");
});

test("future scheduled_publish_at on a published page still reads as scheduled", () => {
  // Editors can re-schedule an already-live page (e.g. a relaunch date);
  // the grid should surface the pending fire time either way.
  assert.equal(deriveWebsitePageStatus("published", FUTURE, NOW), "scheduled");
});

test("past scheduled_publish_at falls back to the underlying status (cron already fired or about to)", () => {
  assert.equal(deriveWebsitePageStatus("draft", PAST, NOW), "draft");
  assert.equal(deriveWebsitePageStatus("published", PAST, NOW), "published");
});

test("null scheduled_publish_at is never scheduled", () => {
  assert.equal(deriveWebsitePageStatus("draft", null, NOW), "draft");
  assert.equal(deriveWebsitePageStatus("published", null, NOW), "published");
});

test("undefined scheduled_publish_at is never scheduled", () => {
  assert.equal(deriveWebsitePageStatus("draft", undefined, NOW), "draft");
});

test("archived overrides a future scheduled_publish_at", () => {
  assert.equal(deriveWebsitePageStatus("archived", FUTURE, NOW), "archived");
});

test("unparseable scheduled_publish_at is treated as unscheduled", () => {
  assert.equal(deriveWebsitePageStatus("draft", "not-a-date", NOW), "draft");
});

test("unknown raw status falls back to draft", () => {
  assert.equal(deriveWebsitePageStatus("weird", null, NOW), "draft");
});
