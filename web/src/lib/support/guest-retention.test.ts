import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GUEST_TICKET_RETENTION_DAYS,
  guestTicketRetentionCutoff,
  isUnconvertedGuestExpired,
} from "./guest-retention";

test("unconverted guest tickets older than the window are expired", () => {
  const now = Date.parse("2026-08-29T00:00:00Z");
  const old = new Date(now - (GUEST_TICKET_RETENTION_DAYS + 1) * 864e5).toISOString();
  const recent = new Date(now - 10 * 864e5).toISOString();
  assert.equal(
    isUnconvertedGuestExpired({
      surface: "guest",
      requesterUserId: null,
      createdAt: old,
      nowMs: now,
    }),
    true,
  );
  assert.equal(
    isUnconvertedGuestExpired({
      surface: "guest",
      requesterUserId: null,
      createdAt: recent,
      nowMs: now,
    }),
    false,
  );
  assert.equal(
    isUnconvertedGuestExpired({
      surface: "guest",
      requesterUserId: "user-1",
      createdAt: old,
      nowMs: now,
    }),
    false,
  );
  assert.ok(guestTicketRetentionCutoff(now).startsWith("2026-05-31"));
});
