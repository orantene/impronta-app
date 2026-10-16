import assert from "node:assert/strict";
import { test } from "node:test";
import { decideAiTurn } from "./support-ai-turn";

const now = new Date("2026-10-14T12:00:00Z");
const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

test("ai-handled ticket always answers", () => {
  assert.equal(decideAiTurn({ handledBy: "ai", lastHumanReplyAt: null, now }), "answer");
});
test("human replied recently: AI stays quiet", () => {
  assert.equal(decideAiTurn({ handledBy: "human", lastHumanReplyAt: ago(5), now }), "human_active");
});
test("human silent past the window: AI may answer again", () => {
  assert.equal(decideAiTurn({ handledBy: "human", lastHumanReplyAt: ago(45), now }), "answer");
});
test("just escalated, no reply yet: quiet; escalated long ago: answers", () => {
  assert.equal(decideAiTurn({ handledBy: "human", lastHumanReplyAt: null, escalatedAt: ago(2), now }), "human_active");
  assert.equal(decideAiTurn({ handledBy: "human", lastHumanReplyAt: null, escalatedAt: ago(120), now }), "answer");
});
test("custom window respected", () => {
  assert.equal(decideAiTurn({ handledBy: "human", lastHumanReplyAt: ago(10), now, quietMinutes: 5 }), "answer");
});
