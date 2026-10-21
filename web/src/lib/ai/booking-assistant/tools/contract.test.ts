/**
 * TUL-36 slice 1: the assistant's tool contract. Strict parsing, per-turn service refs,
 * money tools absent unless the flag is on, and no price field a model could fill.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MONEY_TOOLS,
  READ_ONLY_TOOLS,
  availableTools,
  buildServiceRefs,
  describeTools,
  isMoneyTool,
  parseAssistantToolCall,
  resolveServiceRef,
  routeToolCall,
  toBookingHandoffReason,
} from "./contract";

test("a well-formed call parses, with or without a json fence", () => {
  const a = parseAssistantToolCall('{"tool":"get_quote","args":{"service":"s2","units":3}}');
  assert.deepEqual(a, { ok: true, call: { tool: "get_quote", args: { service: "s2", units: 3 } } });
  const b = parseAssistantToolCall('```json\n{"tool":"check_availability","args":{"service":"s1","date":"2026-11-03"}}\n```');
  assert.equal(b.ok && b.call.tool, "check_availability");
  assert.equal(parseAssistantToolCall({ tool: "handoff_to_person" }).ok, true);
});

test("anything else is a bad_tool_call, never a guess", () => {
  for (const raw of [
    "book me please",
    "{not json",
    "[]",
    '{"tool":"drop_tables","args":{}}',
    '{"tool":"get_quote","args":{"service":"s1","extra":1}}',
    '{"tool":"get_quote","args":{"service":"11111111-1111-1111-1111-111111111111"}}',
    '{"tool":"get_quote","args":{"service":"s1","units":0}}',
    '{"tool":"get_quote","args":{"service":"s1","units":2.5}}',
    '{"tool":"check_availability","args":{"service":"s1","date":"next friday"}}',
    '{"tool":"get_quote","args":{"service":"s1"},"price":1}',
    '{"tool":"__proto__","args":{}}',
    '{"tool":"constructor","args":{}}',
    null,
    42,
  ]) {
    assert.deepEqual(parseAssistantToolCall(raw), { ok: false, reason: "bad_tool_call" }, String(raw));
  }
});

test("a money tool has no amount, price or currency field: a model-supplied number is rejected", () => {
  for (const extra of ["amount", "amount_cents", "price", "total", "currency", "discount"]) {
    const o = parseAssistantToolCall(JSON.stringify({ tool: "create_order", args: { service: "s1", [extra]: 1 } }));
    const p = parseAssistantToolCall(JSON.stringify({ tool: "send_pay_link", args: { service: "s1", [extra]: 1 } }));
    assert.equal(o.ok, false, `create_order accepted ${extra}`);
    assert.equal(p.ok, false, `send_pay_link accepted ${extra}`);
  }
  assert.equal(parseAssistantToolCall('{"tool":"create_order","args":{"service":"s1","units":2,"starts_at":"2026-11-03T15:00:00.000Z"}}').ok, true);
});

test("service refs resolve only for services grounded this turn", () => {
  const refs = buildServiceRefs(["off-a", "off-b", "off-a", ""]);
  assert.equal(resolveServiceRef("s1", refs), "off-a");
  assert.equal(resolveServiceRef("s2", refs), "off-b");
  assert.equal(resolveServiceRef("s3", refs), null, "a hidden or unknown service has no ref");
  assert.equal(resolveServiceRef("off-a", refs), null, "a database id is not a ref");
  assert.equal(buildServiceRefs(Array.from({ length: 80 }, (_, i) => `o${i}`)).size, 40);
});

test("tool availability: nothing when off; money tools only with the flag", () => {
  assert.deepEqual(availableTools({ assistantEnabled: false, moneyEnabled: true }), []);
  assert.deepEqual(availableTools({ assistantEnabled: true }), [...READ_ONLY_TOOLS]);
  assert.deepEqual(availableTools({ assistantEnabled: true, moneyEnabled: false }), [...READ_ONLY_TOOLS]);
  assert.deepEqual(availableTools({ assistantEnabled: true, moneyEnabled: true }), [...READ_ONLY_TOOLS, ...MONEY_TOOLS]);
  assert.ok(MONEY_TOOLS.every((t) => isMoneyTool(t)));
  assert.ok(READ_ONLY_TOOLS.every((t) => !isMoneyTool(t)));
});

test("routing: read-only tools run; money tools hand off while the flag is off; handoff and bad calls hand off", () => {
  const on = { assistantEnabled: true };
  const quote = parseAssistantToolCall('{"tool":"get_quote","args":{"service":"s1"}}');
  assert.equal(routeToolCall(quote, on).kind, "run");
  const pay = parseAssistantToolCall('{"tool":"send_pay_link","args":{"service":"s1"}}');
  assert.deepEqual(routeToolCall(pay, on), { kind: "handoff", reason: "tool_unavailable" });
  assert.equal(routeToolCall(pay, { ...on, moneyEnabled: true }).kind, "run");
  assert.deepEqual(routeToolCall(quote, { assistantEnabled: false }), { kind: "handoff", reason: "tool_unavailable" });
  assert.deepEqual(routeToolCall(parseAssistantToolCall("nope"), on), { kind: "handoff", reason: "bad_tool_call" });
  assert.deepEqual(routeToolCall(parseAssistantToolCall('{"tool":"handoff_to_person","args":{"reason":"human_requested"}}'), on), {
    kind: "handoff",
    reason: "human_requested",
  });
  assert.deepEqual(routeToolCall(parseAssistantToolCall('{"tool":"handoff_to_person"}'), on), { kind: "handoff", reason: "unsure" });
});

test("new handoff reasons read as the phase-1 'unsure' copy; known ones pass through", () => {
  for (const r of ["bad_tool_call", "tool_unavailable", "unknown_service", "not_sellable"] as const) {
    assert.equal(toBookingHandoffReason(r), "unsure");
  }
  assert.equal(toBookingHandoffReason("turn_ceiling"), "turn_ceiling");
  assert.equal(toBookingHandoffReason("human_requested"), "human_requested");
});

test("the model is only told about tools it can use", () => {
  const readOnly = describeTools(availableTools({ assistantEnabled: true }));
  assert.match(readOnly, /get_quote/);
  assert.doesNotMatch(readOnly, /create_order|send_pay_link/);
  assert.match(describeTools(availableTools({ assistantEnabled: true, moneyEnabled: true })), /send_pay_link/);
});
