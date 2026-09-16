import test from "node:test";
import assert from "node:assert/strict";
import { initialMachineState, reduceMachine, type MachineState } from "./machine";

const run = (events: Parameters<typeof reduceMachine>[1][], start?: MachineState) =>
  events.reduce(reduceMachine, start ?? initialMachineState("talent"));

test("entry → dictation → confirm words → reading", () => {
  let s = run([{ type: "dictation", on: true }]);
  assert.equal(s.step, "listening");
  s = run([{ type: "textChanged", text: "I clean houses in Playa" }, { type: "dictation", on: false }], s);
  assert.equal(s.step, "entry");
  s = run([{ type: "reviewWords" }], s);
  assert.equal(s.step, "confirmWords");
  s = run([{ type: "sendStarted" }, { type: "sendAccepted", briefId: "b1", input: { kind: "text", value: "I clean houses in Playa" } }], s);
  assert.equal(s.step, "reading");
  assert.equal(s.briefId, "b1");
  assert.equal(s.busy, false);
});

test("review with empty text does nothing; too_short lands on tooLittle; back returns to entry", () => {
  assert.equal(run([{ type: "reviewWords" }]).step, "entry");
  let s = run([{ type: "textChanged", text: "hola" }, { type: "reviewWords" }, { type: "sendStarted" }, { type: "sendFailed", code: "too_short" }]);
  assert.equal(s.step, "tooLittle");
  assert.equal(s.error, "too_short");
  s = run([{ type: "back" }], s);
  assert.equal(s.step, "entry");
  assert.equal(s.error, null);
  assert.equal(s.text, "hola", "words are never lost");
});

test("resume: only a resumable snapshot offers Continue; Fresh keeps auth and intent", () => {
  const snap = { briefId: "b9", isAuthenticated: true, email: "r@x.test", state: { step: "understood" as const, input: { kind: "text" as const, value: "I clean" }, intent: "business" as const } };
  const s = run([{ type: "resumeLoaded", snapshot: snap }]);
  assert.ok(s.resume);
  assert.equal(s.isAuthenticated, true);
  const cont = run([{ type: "resumeContinue" }], s);
  assert.equal(cont.step, "understood");
  assert.equal(cont.intent, "business");
  assert.equal(cont.text, "I clean");
  assert.equal(cont.briefId, "b9");
  const fresh = run([{ type: "resumeFresh" }], s);
  assert.equal(fresh.step, "entry");
  assert.equal(fresh.intent, "talent");
  assert.equal(fresh.isAuthenticated, true);
  const none = run([{ type: "resumeLoaded", snapshot: { ...snap, state: { step: "entry" } } }]);
  assert.equal(none.resume, null);
});
