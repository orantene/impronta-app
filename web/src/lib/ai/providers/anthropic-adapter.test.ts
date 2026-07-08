import { test } from "node:test";
import assert from "node:assert/strict";

import { buildAnthropicParams, isModelDrift } from "./anthropic-adapter";
import type { ChatCompletionInput } from "@/lib/ai/provider";

const base = { systemPrompt: "S", userMessage: "U" } as ChatCompletionInput;

test("AIQ-22: system prompt is sent as a single cache-marked text block", () => {
  const p = buildAnthropicParams(base, "claude-opus-4-8", "S+schema");
  assert.ok(Array.isArray(p.system), "system is a block array");
  const first = (p.system as Array<{ type: string; text: string; cache_control?: { type: string } }>)[0];
  assert.equal(first.type, "text");
  assert.equal(first.text, "S+schema");
  assert.equal(first.cache_control?.type, "ephemeral");
});

test("AIQ-14: output_config.effort is set only for the adaptive family", () => {
  const on = buildAnthropicParams({ ...base, effort: "xhigh" } as ChatCompletionInput, "claude-opus-4-8", "S");
  assert.equal((on as unknown as { output_config?: { effort?: string } }).output_config?.effort, "xhigh");
  // Non-adaptive model → no output_config (would 400).
  const off = buildAnthropicParams({ ...base, effort: "xhigh" } as ChatCompletionInput, "claude-sonnet-4-20250514", "S");
  assert.equal((off as unknown as { output_config?: unknown }).output_config, undefined);
  // No effort requested → no output_config even on an adaptive model.
  const none = buildAnthropicParams(base, "claude-opus-4-8", "S");
  assert.equal((none as unknown as { output_config?: unknown }).output_config, undefined);
});

test("AIQ-14/thinking: adaptive thinking + no sampling params on the 4.7+/5 family", () => {
  const p = buildAnthropicParams({ ...base, thinking: true }, "claude-opus-4-8", "S");
  assert.deepEqual((p as unknown as { thinking?: unknown }).thinking, { type: "adaptive" });
  assert.equal(p.temperature, undefined, "sampling params omitted for the 4.7+/5 family");
  // Older model → temperature is sent, thinking is NOT adaptive.
  const old = buildAnthropicParams({ ...base, thinking: true }, "claude-sonnet-4-20250514", "S");
  assert.equal(typeof old.temperature, "number");
  assert.equal((old as unknown as { thinking?: unknown }).thinking, undefined);
});

test("AIQ-31: snapshot suffix is not drift; a family change is", () => {
  assert.equal(isModelDrift("claude-opus-4-8", "claude-opus-4-8-20260115"), false);
  assert.equal(isModelDrift("claude-opus-4-8", "claude-opus-4-8"), false);
  assert.equal(isModelDrift("claude-opus-4-8", "claude-sonnet-4-20250514"), true);
  assert.equal(isModelDrift("claude-opus-4-8", ""), false);
});
