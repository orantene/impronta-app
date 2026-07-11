/**
 * Unit tests for deriveProjectPhase (W2-A dock — Projects status chip honesty).
 * Run: npx tsx --test src/app/t/\[profileCode\]/_chat/guest-dock-view.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveProjectPhase } from "./guest-dock-view";

test("a draft always reads as draft, whatever the message tail says", () => {
  assert.equal(
    deriveProjectPhase({ isDraft: true, threadStatus: "draft", lastMessageAuthor: "agency" }),
    "draft",
  );
  assert.equal(
    deriveProjectPhase({ isDraft: false, threadStatus: "draft", lastMessageAuthor: null }),
    "draft",
  );
});

test("sent with no agency response reads as awaiting", () => {
  assert.equal(
    deriveProjectPhase({ isDraft: false, threadStatus: "open", lastMessageAuthor: "guest" }),
    "awaiting",
  );
  assert.equal(
    deriveProjectPhase({ isDraft: false, threadStatus: "open", lastMessageAuthor: null }),
    "awaiting",
  );
  // Missing field (older summaries) degrades to awaiting, never to replied.
  assert.equal(
    deriveProjectPhase({ isDraft: false, threadStatus: "open" }),
    "awaiting",
  );
});

test("an agency message flips the phase to replied", () => {
  assert.equal(
    deriveProjectPhase({ isDraft: false, threadStatus: "open", lastMessageAuthor: "agency" }),
    "replied",
  );
});

test("agency-driven statuses read as replied even without a message", () => {
  for (const threadStatus of ["offer_pending", "approved"] as const) {
    assert.equal(
      deriveProjectPhase({ isDraft: false, threadStatus, lastMessageAuthor: "guest" }),
      "replied",
    );
  }
});

test("a booked inquiry gets its own phase (strongest chip), never draft", () => {
  assert.equal(
    deriveProjectPhase({ isDraft: false, threadStatus: "booked", lastMessageAuthor: "guest" }),
    "booked",
  );
  // Draft wins over everything — a draft can't read as booked.
  assert.equal(
    deriveProjectPhase({ isDraft: true, threadStatus: "booked", lastMessageAuthor: null }),
    "draft",
  );
});
