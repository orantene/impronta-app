/**
 * Guest send actions must schedule the booking assistant after the response
 * (`after()`), never await the LLM inline.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ACTIONS = resolve(
  process.cwd(),
  "src/app/t/[profileCode]/_actions/guest-chat-actions.ts",
);
const TURN = resolve(process.cwd(), "src/lib/ai/booking-assistant/turn.server.ts");

test("guest-chat-actions schedules assistant; does not await maybeRun", () => {
  const src = readFileSync(ACTIONS, "utf8");
  assert.match(src, /scheduleBookingAssistantTurn/);
  assert.doesNotMatch(src, /await\s+maybeRunBookingAssistantTurn/);
  // Avoid /s (dotAll): tsc target < es2018 rejects that flag in this file.
  assert.doesNotMatch(
    src,
    /from\s+"@\/lib\/ai\/booking-assistant\/turn\.server"[\s\S]*maybeRunBookingAssistantTurn/,
  );
});

test("scheduleBookingAssistantTurn uses next/server after()", () => {
  const src = readFileSync(TURN, "utf8");
  assert.match(src, /from\s+"next\/server"/);
  assert.match(src, /after\(run\)/);
  assert.match(src, /AbortController|signal:\s*controller\.signal/);
  assert.match(src, /LLM_TIMEOUT_MS\s*=\s*8_000/);
});

test("maybeRun logs every silent skip branch (Live QA: no silent OFF)", () => {
  const src = readFileSync(TURN, "utf8");
  for (const reason of [
    "no_talent_profile_id",
    "no_service_role_client",
    "ai_master_disabled",
  ] as const) {
    assert.match(src, new RegExp(`reason:\\s*"${reason}"`));
  }
  assert.match(src, /booking_assistant_skip/);
  assert.match(src, /booking_assistant_schedule/);
  assert.match(src, /booking_assistant_run/);
});

test("sendGuestMessageAction resolves talent via lineup spine when participants empty", () => {
  const src = readFileSync(ACTIONS, "utf8");
  assert.match(src, /resolveBookingAssistantTalentId/);
  assert.match(src, /readSelectedIds/);
  assert.match(src, /interpreted_query/);
});

// TUL-36 x TUL-1154: the structured (pick-card) path must keep main's wrong-language guard.
test("turn.server structured path hands off a reply in the wrong language", () => {
  const src = readFileSync(resolve(__dirname, "turn.server.ts"), "utf8");
  assert.match(src, /replyLanguageMismatch\(args\.guestMessage, sanitized\.text\)/);
  assert.match(src, /wrongLanguage \? "wrong_language"/);
});
