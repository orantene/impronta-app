import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAssistantOutput } from "./structured";
import { sanitizeBookingAssistantOutput } from "./guardrails";

/**
 * TUL-36 phase 2 runtime checks 1 + 2, as deterministic tests on recorded
 * model outputs. What these cannot prove: how often the live model actually
 * returns the schema. The Anthropic adapter only appends a schema instruction
 * to the system prompt (schemaInstruction); it does not enforce it.
 */

// Same shape catalogGrounding() builds in turn.server.ts.
const GROUNDING = JSON.stringify([
  { id: "off_cut_01", title: "Corte de pelo", price: "$850.00 MXN", durationMinutes: 60 },
  { id: "off_color_02", title: "Color completo", price: "$1,200 MXN", durationMinutes: 120 },
]);

test("check 1: valid JSON is structured", () => {
  const out = classifyAssistantOutput('{"reply":"Tengo horarios mañana.","action":"offer_times","offering_id":"off_cut_01","date":"2026-10-20"}');
  assert.equal(out.kind, "structured");
  if (out.kind === "structured") {
    assert.equal(out.value.action, "offer_times");
    assert.equal(out.value.offeringId, "off_cut_01");
  }
});

test("check 1: JSON inside prose is recovered, never posted raw", () => {
  const out = classifyAssistantOutput('Claro, aquí va: {"reply":"El corte cuesta $850.00 MXN.","action":"answer"} Saludos');
  assert.equal(out.kind, "structured");
  if (out.kind === "structured") assert.equal(out.value.reply, "El corte cuesta $850.00 MXN.");
});

test("check 1: truncated JSON is broken (handoff), never posted", () => {
  assert.equal(classifyAssistantOutput('{"reply":"Tengo horarios ma').kind, "broken");
  assert.equal(classifyAssistantOutput('Aquí va {"reply":"x","action":"offer_ti').kind, "broken");
});

test("check 1: plain text keeps the old text path", () => {
  const out = classifyAssistantOutput("El corte dura 60 minutos.");
  assert.deepEqual(out, { kind: "text", text: "El corte dura 60 minutos." });
});

test("check 2: catalog prices pass with ids present in grounding", () => {
  const r = sanitizeBookingAssistantOutput("El corte cuesta $850.00 MXN y el color $1,200 MXN.", GROUNDING);
  assert.equal(r.escalate, false);
  assert.match(r.text, /\$850\.00 MXN/);
});

test("check 2: ids in grounding do not ground a made-up price", () => {
  const r = sanitizeBookingAssistantOutput("El corte cuesta $500 MXN.", GROUNDING);
  assert.equal(r.escalate, true);
  assert.doesNotMatch(r.text, /\$500/);
});
