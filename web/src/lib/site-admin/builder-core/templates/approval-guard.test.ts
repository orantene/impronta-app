/**
 * approval-guard.test.ts — unit tests for the G4 two-person approval pure logic:
 * the self-approve guard predicate + the submit/review stamping shape.
 *
 * Runner: node:test + node:assert/strict (tsx --test). The DB-backed server
 * actions (submitTemplateForReview / rejectToDraft / publishTemplate) are not
 * exercised here; we test the deterministic helpers they delegate to.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isSelfApprove,
  buildSubmitStamp,
  buildReviewStamp,
} from "./approval-guard";

describe("isSelfApprove (self-approve guard predicate)", () => {
  it("is true when reviewer === submitter", () => {
    assert.equal(isSelfApprove("user-1", "user-1"), true);
  });

  it("is false when reviewer differs from submitter (two-person path)", () => {
    assert.equal(isSelfApprove("user-1", "user-2"), false);
  });

  it("is false when there is no recorded submitter (legacy/un-stamped row)", () => {
    assert.equal(isSelfApprove(null, "user-1"), false);
    assert.equal(isSelfApprove(undefined, "user-1"), false);
  });

  it("never blocks an empty-string submitter (treated as unset)", () => {
    assert.equal(isSelfApprove("", "user-1"), false);
  });
});

describe("buildSubmitStamp", () => {
  it("stamps submitter + time and clears prior review provenance", () => {
    const stamp = buildSubmitStamp("user-7", "2026-06-18T10:00:00.000Z");
    assert.deepEqual(stamp, {
      submitted_by: "user-7",
      submitted_at: "2026-06-18T10:00:00.000Z",
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
    });
  });

  it("defaults submitted_at to an ISO timestamp", () => {
    const stamp = buildSubmitStamp("user-7");
    assert.equal(typeof stamp.submitted_at, "string");
    assert.equal(stamp.submitted_at, new Date(stamp.submitted_at).toISOString());
  });
});

describe("buildReviewStamp", () => {
  it("stamps reviewer + time and captures a trimmed reason", () => {
    const stamp = buildReviewStamp("user-2", "  needs a hero image  ", "2026-06-18T11:00:00.000Z");
    assert.deepEqual(stamp, {
      reviewed_by: "user-2",
      reviewed_at: "2026-06-18T11:00:00.000Z",
      review_note: "needs a hero image",
    });
  });

  it("coerces a blank reason to null (explicit clear)", () => {
    const stamp = buildReviewStamp("user-2", "   ", "2026-06-18T11:00:00.000Z");
    assert.equal(stamp.review_note, null);
  });

  it("omits review_note entirely when no reason is given (leaves column untouched)", () => {
    const stamp = buildReviewStamp("user-2", undefined, "2026-06-18T11:00:00.000Z");
    assert.deepEqual(stamp, {
      reviewed_by: "user-2",
      reviewed_at: "2026-06-18T11:00:00.000Z",
    });
    assert.equal("review_note" in stamp, false);
  });

  it("defaults reviewed_at to an ISO timestamp", () => {
    const stamp = buildReviewStamp("user-2");
    assert.equal(typeof stamp.reviewed_at, "string");
    assert.equal(stamp.reviewed_at, new Date(stamp.reviewed_at).toISOString());
  });
});
