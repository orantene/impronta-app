import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { decideAiTurn } from "./support-ai-turn";
import { escalationLogLine } from "./support-escalation-log";
import { shouldOfferHumanInsteadOfEscalating } from "./support-ai-failure";
import { readTakeover, withTakeover } from "./support-takeover";

const now = new Date("2026-10-22T12:00:00Z");
const ago = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

test("a taken ticket never gets an AI reply, however old the escalation or human reply is", () => {
  for (const lastHumanReplyAt of [null, ago(5), ago(600)]) {
    assert.equal(
      decideAiTurn({ handledBy: "human", lastHumanReplyAt, escalatedAt: ago(600), now, takenOver: true }),
      "human_active",
    );
  }
  // Without the takeover mark the quiet window still lets the AI back in (unchanged behavior).
  assert.equal(decideAiTurn({ handledBy: "human", lastHumanReplyAt: null, escalatedAt: ago(600), now }), "answer");
});

test("takeover round-trips through ticket metadata and keeps other keys", () => {
  const meta = withTakeover({ locale: "es" }, { userId: "u1", name: "Ana", at: "2026-10-22T12:00:00Z" });
  assert.equal(meta.locale, "es");
  assert.deepEqual(readTakeover(meta), { userId: "u1", name: "Ana", at: "2026-10-22T12:00:00Z" });
  assert.equal(readTakeover({}), null);
  assert.equal(readTakeover(null), null);
});

test("the support-chat route checks the takeover at reply time", () => {
  const src = readFileSync(new URL("../../app/api/ai/support-chat/route.ts", import.meta.url), "utf8");
  assert.match(src, /takenOver: readTakeover\(access\.ticket\.metadata\) !== null/);
});

test("escalation log line is localized and names the reason", () => {
  assert.match(escalationLogLine("es", 22, "ai_unavailable"), /^Ticket #22 pasado a una persona: la IA no estaba disponible/);
  assert.match(escalationLogLine("en", 22, "ai_unavailable"), /^Ticket #22 handed to a human: the AI was unavailable/);
  assert.ok(!escalationLogLine("es", 1, "staff_initiated").includes("—"));
});

test("an AI-named ai_unavailable reason only offers a person", () => {
  assert.equal(shouldOfferHumanInsteadOfEscalating("ai_unavailable"), true);
  assert.equal(shouldOfferHumanInsteadOfEscalating("legal"), false);
});
