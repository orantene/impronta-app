import assert from "node:assert/strict";
import { test } from "node:test";

import {
  derivePostUiStatus,
  isoToLocalInput,
  localInputToIso,
  postUiStatusToPatch,
} from "@/lib/cms/post-writer-status";

test("derive: the four writer statuses", () => {
  assert.equal(derivePostUiStatus({ status: "draft", isUnlisted: false, scheduledPublishAt: null }), "draft");
  assert.equal(derivePostUiStatus({ status: "draft", isUnlisted: false, scheduledPublishAt: "2026-12-01T10:00:00.000Z" }), "scheduled");
  assert.equal(derivePostUiStatus({ status: "published", isUnlisted: false, scheduledPublishAt: null }), "published");
  assert.equal(derivePostUiStatus({ status: "published", isUnlisted: true, scheduledPublishAt: null }), "hidden");
  assert.equal(derivePostUiStatus({ status: "archived", isUnlisted: false, scheduledPublishAt: null }), "draft");
});

test("patch: each status writes the columns it means", () => {
  assert.deepEqual(postUiStatusToPatch("draft", null), { status: "draft", scheduled_publish_at: null, is_unlisted: false });
  assert.deepEqual(postUiStatusToPatch("scheduled", "2026-12-01T10:00:00.000Z"), {
    status: "draft",
    scheduled_publish_at: "2026-12-01T10:00:00.000Z",
    is_unlisted: false,
  });
  assert.deepEqual(postUiStatusToPatch("published", null), { status: "published", scheduled_publish_at: null, is_unlisted: false });
  assert.deepEqual(postUiStatusToPatch("hidden", null), { status: "published", scheduled_publish_at: null, is_unlisted: true });
});

test("datetime-local round trips through ISO", () => {
  const iso = "2026-12-01T10:30:00.000Z";
  assert.equal(localInputToIso(isoToLocalInput(iso)), iso);
  assert.equal(isoToLocalInput(null), "");
  assert.equal(localInputToIso(""), null);
  assert.equal(localInputToIso("not a date"), null);
});
