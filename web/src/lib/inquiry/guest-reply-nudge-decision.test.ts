/**
 * UNIT TEST — guest-reply-nudge-decision.ts (message-panel wave W2-F, D7;
 * inquiry email loop upgrade 2026-08-20).
 *
 * Pins the pure send/skip predicate for the staff-reply → inquirer email
 * mirror. Matrix: the canonical guest-chat case and the form-routed case (a
 * client account but NO guest session), then each gate that must SKIP (wrong
 * thread, inquirer's own send, no reachable party, seed placeholder,
 * per-conversation mute, guest live in popup, signed-in client reading the
 * thread, coalescing window), plus the boundary cases on both activity
 * windows and the throttle.
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
    clientUserId: "user-client-1",
    contactName: "Jane Doe",
    contactEmail: "jane@example.com",
    mirrorMutedAtMs: null,
    guestLastActiveAtMs: null,
    clientLastReadAtMs: null,
    lastNudgeAtMs: null,
    nowMs: NOW,
    guestActiveWindowMs: GUEST_ACTIVE_WINDOW_MS,
    throttleWindowMs: GUEST_REPLY_THROTTLE_WINDOW_MS,
    ...over,
  };
}

describe("decideGuestReplyNudge", () => {
  it("SENDS the canonical case: staff reply, private thread, reachable inquirer, real contact, idle, unmuted, no prior email", () => {
    assert.deepEqual(decideGuestReplyNudge(base()), { send: true });
  });

  it("SENDS a form-routed inquiry: client account attached but NO guest session", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ guestSessionId: null, clientUserId: "user-client-1" })),
      { send: true },
    );
  });

  it("SENDS a chat-guest inquiry whose client account could not be provisioned (guest session only)", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ guestSessionId: "gs-abc123", clientUserId: null })),
      { send: true },
    );
  });

  it("SKIPS a non-private (group / talent-coordination) thread", () => {
    assert.deepEqual(decideGuestReplyNudge(base({ threadType: "group" })), {
      send: false,
      reason: "not_private",
    });
  });

  it("SKIPS when the sender is not staff (the inquirer's own message must never email the inquirer)", () => {
    assert.deepEqual(decideGuestReplyNudge(base({ senderIsStaff: false })), {
      send: false,
      reason: "not_staff_reply",
    });
  });

  it("SKIPS when there is no reachable inquirer party (no guest session AND no client account)", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ guestSessionId: null, clientUserId: null })),
      { send: false, reason: "no_client_party" },
    );
    assert.deepEqual(
      decideGuestReplyNudge(base({ guestSessionId: "  ", clientUserId: "  " })),
      { send: false, reason: "no_client_party" },
    );
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

  it("SKIPS a muted conversation — the unsubscribe link is a hard stop", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ mirrorMutedAtMs: NOW - 90 * 24 * 60 * 60 * 1000 })),
      { send: false, reason: "muted" },
    );
    // Mute wins even against an otherwise-canonical send with idle inquirer.
    assert.deepEqual(
      decideGuestReplyNudge(base({ mirrorMutedAtMs: NOW })),
      { send: false, reason: "muted" },
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

  it("SKIPS when the signed-in client read the thread inside the active window (thread open in the product)", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ clientLastReadAtMs: NOW - 30_000 })),
      { send: false, reason: "client_active" },
    );
  });

  it("SENDS when the client's read watermark is just OUTSIDE the active window", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ clientLastReadAtMs: NOW - GUEST_ACTIVE_WINDOW_MS - 1 })),
      { send: true },
    );
  });

  it("SKIPS (throttled) when a reply email went out inside the coalescing window", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ lastNudgeAtMs: NOW - 60 * 1000 })),
      { send: false, reason: "throttled" },
    );
  });

  it("SKIPS (throttled) at the exact edge just inside the window — a reply burst collapses to one email", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ lastNudgeAtMs: NOW - GUEST_REPLY_THROTTLE_WINDOW_MS + 1 })),
      { send: false, reason: "throttled" },
    );
  });

  it("SENDS when the last reply email is at/just past the coalescing window", () => {
    assert.deepEqual(
      decideGuestReplyNudge(base({ lastNudgeAtMs: NOW - GUEST_REPLY_THROTTLE_WINDOW_MS })),
      { send: true },
    );
  });

  it("gate precedence: thread type is checked before staff/party/contact/mute", () => {
    // A group thread with a seed contact + inquirer's own send still reports
    // the FIRST failing gate (not_private), so callers get a stable reason.
    assert.deepEqual(
      decideGuestReplyNudge(
        base({
          threadType: "group",
          senderIsStaff: false,
          contactEmail: "",
          mirrorMutedAtMs: NOW,
        }),
      ),
      { send: false, reason: "not_private" },
    );
  });
});
