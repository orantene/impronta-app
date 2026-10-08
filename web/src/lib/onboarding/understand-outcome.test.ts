import assert from "node:assert/strict";
import { test } from "node:test";

import { pickDefaultChatKind } from "../ai/default-chat-kind";
import { aiProblemLogLine, classifyExtraction, classifyProviderState } from "./understand-outcome";

test("provider state: flags off degrades, on and unconfigured is ai_not_configured", () => {
  assert.equal(classifyProviderState({ flagsOn: false, configured: false }), "degrade");
  assert.equal(classifyProviderState({ flagsOn: true, configured: false }), "ai_not_configured");
  assert.equal(classifyProviderState({ flagsOn: true, configured: true }), "ready");
});

test("extraction: a failed or missing outcome is ai_failed, an ok one is not an AI problem (too_little stays)", () => {
  assert.equal(classifyExtraction({ ok: false }), "ai_failed");
  assert.equal(classifyExtraction(null), "ai_failed");
  assert.equal(classifyExtraction({ ok: true }), null);
});

test("env fallback: used only when there is no DB default row, anthropic before openai", () => {
  assert.equal(pickDefaultChatKind(null, { anthropic: true, openai: true }), "anthropic");
  assert.equal(pickDefaultChatKind(null, { anthropic: false, openai: true }), "openai");
  assert.equal(pickDefaultChatKind(null, { anthropic: false, openai: false }), "openai");
});

test("DB wins when a default row exists, whatever the env holds", () => {
  assert.equal(pickDefaultChatKind({ kind: "openai", disabled: false }, { anthropic: true, openai: false }), "openai");
  assert.equal(pickDefaultChatKind({ kind: "anthropic", disabled: false }, { anthropic: false, openai: true }), "anthropic");
  assert.equal(pickDefaultChatKind({ kind: "anthropic", disabled: true }, { anthropic: true, openai: false }), "openai");
});

test("log line carries the kind and provider id only, never a key or text", () => {
  const secret = "sk-ant-SECRETVALUE123";
  const line = aiProblemLogLine("ai_failed", `anthropic ${secret}`);
  assert.match(line, /^\[onboarding\.understand\] ai_failed provider=/);
  assert.ok(!line.includes(secret));
  assert.ok(!line.includes("sk-"));
  assert.equal(aiProblemLogLine("ai_not_configured", "openai"), "[onboarding.understand] ai_not_configured provider=openai");
});
