/**
 * Talent Messages v5 must honour the same deep-link contracts as admin:
 * - `?inquiry=<uuid>` on /talent/inbox
 * - pinNextConversation → consumePendingConversation from /talent/inbox/[id]
 *
 * Static source check so the wiring cannot silently regress (QA Story 4
 * agency money deep-link left "Pick a conversation" without this).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "MessagesPage.tsx"),
  "utf8",
);

describe("TalentMessagesV5 deep-link wiring", () => {
  it("reads ?inquiry= via useSearchParams", () => {
    assert.match(src, /useSearchParams/);
    assert.match(src, /searchParams\.get\("inquiry"\)/);
  });

  it("passes initialInquiryId into MessagesV5Shell", () => {
    assert.match(src, /initialInquiryId=\{initialInquiryId\}/);
  });

  it("consumes pinNextConversation from PinThenRedirect", () => {
    assert.match(src, /consumePendingConversation/);
  });
});
