/**
 * UNIT TEST — guest-reply-nudge-decision.ts (message-panel wave W2-F, D7).
 *
 * Pins the pure send/skip predicate for the "the agency replied" guest email.
 * Matrix: real contact + guest-originated + staff reply + private thread, then
 * each gate that must SKIP (wrong thread, guest's own send, no guest session,
 * seed placeholder, guest still live, throttle window), plus the boundary
 * cases (nudge just outside the 6h window → send; guest active just outside the
 * live window → send).
 *
 * Run: npx tsx --test src/lib/inquiry/guest-reply-nudge-decision.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  decideGuestReplyNudge,
  GUEST_ACTIVE_WINDOW_MS,
  GUEST_REPLY_THROTTLE_WINDOW_MS,
  type GuestReplyNudgeDecisionInput,
} from "./guest-reply-nudge-decision";

const NOW = 1_700_000_000_000;

/** A fully-qualifying "should send" input; override one field per case. */
function base(
  over: Partial<GuestReplyNudgeDecisionInput> = {},
): GuestReplyNudgeDecisionInput {
  return {
    threadType: "private",
    senderIsStaff: true,
    guestSessionId: "gs-abc123",
    contactName: "Jane Doe",
    contactEmail: "jane@example.com",
    guestLastActiveAtMs: null,
    lastNudgeAtMs: null,
    nowMs: NOW,
    guestActiveWindowMs: GUEST_ACTIVE_WINDOW_MS,
    throttleWindowMs: GUEST_REPLY_THROTTLE_WINDOW_MS,
    ...over,
  };
}

describe("decideGuestReplyNudge", () => {
  it("SENDS the canonical case: staff reply, private thread, guest-originated, real contact, idle guest, no prior nudge", () => {
    assert.deepEqual(decideGuestReplyNudge(base()), { send: true });
  });

  it("SKIPS a non-private (group / talent-coordination) thread", () => {
    assert.deepEqual(decideGuestReplyNudge(base({ threadType: "group" })), {
      send: false,
      reason: "not_private",
    });
  });

  it("SKIPS when the sender is not staff (the guest's own message must never nudge the guest)", () => {
    assert.deepEqual(decideGuestReplyNudge(base({ senderIsStaff: false })), {
      send: false,
      reason: "not_staff_reply",
    });
  });

  it("SKIPS a non-guest-originated inquiry (no guest_session_id)", () => {
    assert.deepEqual(decideGuestReplyNudge(base({ guestSessionId: null })), {
      send: false,
      reason: "not_guest_originated",
    });
    assert.deepEqual(decideGuestReplyNudge(base({ guestSessionId: "  " })), {
      send: false,
      reason: "not_guest_originated",
    });
  });

  it("SKIPS the synthetic seed contact (pending email — no real address to reach)", () => {
    assert.deepEqual(
      decideGuestReplyNudge(
        base({ contactName: "Guest", contactEmail: "pending-gs-abc123@guest.impronta" }),
      ),
      { send: false, reason: "seed_contact" },
    );
  });

  it("SKIPS the pre-promotion placeholder (name 'Guest' + empty email)", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ contactName: "Guest", contactEmail: "" })),
      { send: false, reason: "seed_contact" },
    );
  });

  it("SKIPS when the guest is live (a guest message inside the active window)", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ guestLastActiveAtMs: NOW - 30_000 })),
      { send: false, reason: "guest_active" },
    );
  });

  it("SENDS when the guest's last message is just OUTSIDE the active window", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ guestLastActiveAtMs: NOW - GUEST_ACTIVE_WINDOW_MS - 1 })),
      { send: true },
    );
  });

  it("SKIPS (throttled) when a nudge went out inside the 6h window", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ lastNudgeAtMs: NOW - 60 * 60 * 1000 })),
      { send: false, reason: "throttled" },
    );
  });

  it("SKIPS (throttled) at the exact edge just inside the window — a reply burst collapses to one email", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ lastNudgeAtMs: NOW - GUEST_REPLY_THROTTLE_WINDOW_MS + 1 })),
      { send: false, reason: "throttled" },
    );
  });

  it("SENDS when the last nudge is at/just past the 6h window", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ lastNudgeAtMs: NOW - GUEST_REPLY_THROTTLE_WINDOW_MS })),
      { send: true },
    );
  });

  it("gate precedence: thread type is checked before staff/guest/contact", () => {
    // A group thread with a seed contact + guest's own send still reports the
    // FIRST failing gate (not_private), so callers get a stable reason.
    assert.deepEqual(
      decideGuestReplyNudge(
        base({ threadType: "group", senderIsStaff: false, contactEmail: "" }),
      ),
      { send: false, reason: "not_private" },
    );
  });
});
