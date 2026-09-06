import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildAnthropicParams } from "./anthropic-adapter";

// Thinking has THREE states, and the middle one is the expensive default.
//
// This model family thinks unless told not to, so a caller that never mentions
// thinking still pays for it. Measured on the guest support call, same prompt,
// same schema, same token budget, three calls each way:
//
//   default   5.98 / 4.30 / 5.17 s   434 output tokens (238 of them thinking)
//   disabled  2.75 / 2.71 / 2.53 s   182 output tokens (0 thinking)
//
// More than half the latency of a reply a visitor waits on with a spinner was
// reasoning nobody had asked for.

const MODEL = "claude-sonnet-5";
const base = { systemPrompt: "s", userMessage: "u" } as Parameters<typeof buildAnthropicParams>[0];

function thinkingOf(input: Partial<Parameters<typeof buildAnthropicParams>[0]>) {
  const p = buildAnthropicParams({ ...base, ...input }, MODEL, "s");
  return (p as unknown as { thinking?: { type?: string } }).thinking;
}

test("an explicit false disables thinking", () => {
  assert.deepEqual(thinkingOf({ thinking: false }), { type: "disabled" });
});

test("an explicit true still opts into adaptive thinking", () => {
  assert.deepEqual(thinkingOf({ thinking: true }), { type: "adaptive" });
});

test("undefined leaves the provider default alone, so no existing caller changes", () => {
  // The point of three states: turning thinking off globally would silently
  // change every other caller, some of which want it. Only an explicit opt-out
  // takes effect.
  assert.equal(thinkingOf({}), undefined);
});

test("older models never receive a thinking field at all", () => {
  // They take a different shape entirely and 400 on this one.
  const p = buildAnthropicParams({ ...base, thinking: false }, "claude-sonnet-4-6", "s");
  assert.equal((p as unknown as { thinking?: unknown }).thinking, undefined);
});

test("the guest support route asks for no thinking", () => {
  // The budget this PR bought, pinned where it can be pinned: if somebody
  // removes the flag, the reply goes back to ~5s and nothing else would say so.
  const src = readFileSync(
    join(process.cwd(), "src", "app", "api", "ai", "guest-support-chat", "route.ts"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /thinking:\s*false/, "the guest reply no longer disables thinking");
});
