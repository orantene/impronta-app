import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DIAGNOSTICS_RETENTION_DAYS,
  GUEST_TICKET_RETENTION_DAYS,
  diagnosticsRetentionCutoff,
  guestTicketRetentionCutoff,
  isUnconvertedGuestExpired,
} from "./guest-retention";

const NOW = Date.parse("2026-09-02T00:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 864e5).toISOString();

test("an unconverted guest ticket expires past the window", () => {
  assert.equal(
    isUnconvertedGuestExpired({
      surface: "guest",
      requesterUserId: null,
      createdAt: daysAgo(GUEST_TICKET_RETENTION_DAYS + 1),
      nowMs: NOW,
    }),
    true,
  );
});

test("a RECENT guest ticket is not expired", () => {
  // Boundary case carried over from the original test. This is the one that
  // catches an inverted comparison — without it, a reaper that deletes
  // everything still passes every other assertion here.
  assert.equal(
    isUnconvertedGuestExpired({
      surface: "guest",
      requesterUserId: null,
      createdAt: daysAgo(10),
      nowMs: NOW,
    }),
    false,
  );
});

test("a CLAIMED guest ticket is never purged", () => {
  assert.equal(
    isUnconvertedGuestExpired({
      surface: "guest",
      requesterUserId: "user-1",
      createdAt: daysAgo(GUEST_TICKET_RETENTION_DAYS + 500),
      nowMs: NOW,
    }),
    false,
    "a guest who created an account must keep their history",
  );
});

test("a workspace ticket is never purged by the guest reaper", () => {
  assert.equal(
    isUnconvertedGuestExpired({
      surface: "workspace",
      requesterUserId: null,
      createdAt: daysAgo(9999),
      nowMs: NOW,
    }),
    false,
  );
});

test("diagnostics age out later than guest tickets, and both cutoffs are in the past", () => {
  // Diagnostics live on tickets that are otherwise kept forever, so their window
  // is deliberately longer than the guest-ticket one but still finite.
  assert.ok(DIAGNOSTICS_RETENTION_DAYS > GUEST_TICKET_RETENTION_DAYS);
  assert.ok(Date.parse(diagnosticsRetentionCutoff(NOW)) < NOW);
  assert.ok(Date.parse(guestTicketRetentionCutoff(NOW)) < NOW);
  // Exact date, carried over from the original: a cutoff that silently drifts
  // by a day is invisible to a relative comparison.
  assert.ok(guestTicketRetentionCutoff(NOW).startsWith("2026-06-04"));
});
