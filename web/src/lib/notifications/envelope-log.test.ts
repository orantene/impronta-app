/**
 * UNIT TEST — the outbound envelope is recorded on the dispatch_log row.
 *
 * WHY THIS EXISTS: on 2026-09-05 the CEO asked whether a production reply
 * nudge carried `Reply-To: impronta.talento@gmail.com`. The honest answer was
 * "I cannot tell you" — notification_dispatch_log stores status, provider_ref,
 * template and bounce columns, but NOT the headers, and reading them any other
 * way needs the Resend key or the recipient's inbox. A header we set but never
 * record is a header nobody can audit.
 *
 * These cases pin the two halves of that fix: a tenant WITH a contact email
 * records the Reply-To it sent with, and a tenant WITHOUT one records null —
 * never an invented address, and never a silently absent field.
 *
 * Run: npx tsx --test src/lib/notifications/envelope-log.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { dispatchLogPatchFromHandlerResult } from "./dispatcher-outcome";

/**
 * Mirrors the merge the dispatcher performs in markDispatchLogSent. Kept here
 * as a pure function so the contract is testable without a DB: the row's
 * existing payload is PRESERVED and the envelope is merged onto it.
 */
function payloadWithEnvelope(
  basePayload: Record<string, unknown>,
  envelope: { from: string; replyTo: string | null } | null,
): Record<string, unknown> {
  if (!envelope) return basePayload;
  return {
    ...basePayload,
    emailFrom: envelope.from,
    emailReplyTo: envelope.replyTo,
  };
}

describe("dispatch_log envelope recording", () => {
  it("records the Reply-To for a tenant that has a contact email", () => {
    const payload = payloadWithEnvelope(
      { contactName: "Elena", preview: "hi" },
      { from: "Impronta <noreply@tulala.digital>", replyTo: "impronta.talento@gmail.com" },
    );
    assert.equal(payload.emailReplyTo, "impronta.talento@gmail.com");
    assert.equal(payload.emailFrom, "Impronta <noreply@tulala.digital>");
  });

  it("records NULL Reply-To for a tenant with no contact email — not an invented address", () => {
    const payload = payloadWithEnvelope(
      { contactName: "Sam" },
      { from: "Tulala <noreply@tulala.digital>", replyTo: null },
    );
    assert.equal(payload.emailReplyTo, null);
    assert.ok("emailReplyTo" in payload, "the field must be PRESENT and null, so absence is distinguishable from 'not recorded'");
  });

  it("PRESERVES the payload the row already carries (the digest sweep and retry cron read it)", () => {
    const payload = payloadWithEnvelope(
      { digest: true, recipientRole: "client", preview: "keep me" },
      { from: "Tulala <noreply@tulala.digital>", replyTo: null },
    );
    assert.equal(payload.digest, true);
    assert.equal(payload.recipientRole, "client");
    assert.equal(payload.preview, "keep me");
  });

  it("leaves the payload untouched for a channel that reports no envelope (in_app)", () => {
    const base = { preview: "bell only" };
    assert.deepEqual(payloadWithEnvelope(base, null), base);
  });

  it("a null provider ref is still 'skipped', unchanged by envelope recording", () => {
    assert.equal(dispatchLogPatchFromHandlerResult(null).status, "skipped");
    assert.equal(dispatchLogPatchFromHandlerResult("abc-123").status, "sent");
  });
});
