import test from "node:test";
import assert from "node:assert/strict";
import { canResume, parsePersistedModuleState, wordCount } from "./module-state";
import { EXAMPLE_SENTENCES, exampleAt } from "./example-bank";

test("persisted state is re-validated field by field", () => {
  const s = parsePersistedModuleState({
    intent: "business", step: "understood", input: { kind: "text", value: "hola" },
    path: "nope", questionIndex: -1, locale: "fr", junk: 1,
  });
  assert.deepEqual(s, { intent: "business", step: "understood", input: { kind: "text", value: "hola" } });
  assert.deepEqual(parsePersistedModuleState(null), {});
  assert.deepEqual(parsePersistedModuleState([1]), {});
});

test("resume only from a step past entry with words kept", () => {
  assert.equal(canResume({ step: "entry" }), false);
  assert.equal(canResume({ step: "understood" }), false);
  assert.equal(canResume({ step: "understood", input: { kind: "text", value: "I clean houses" } }), true);
  assert.equal(canResume({ step: "listening", input: { kind: "text", value: "x" } }), false);
});

test("example bank: EN and ES in parallel, rotation wraps", () => {
  assert.equal(EXAMPLE_SENTENCES.en.length, EXAMPLE_SENTENCES.es.length);
  assert.ok(EXAMPLE_SENTENCES.en.length >= 10);
  assert.equal(exampleAt("en", EXAMPLE_SENTENCES.en.length), EXAMPLE_SENTENCES.en[0]);
  assert.equal(exampleAt("es", -1), EXAMPLE_SENTENCES.es[EXAMPLE_SENTENCES.es.length - 1]);
  for (const s of [...EXAMPLE_SENTENCES.en, ...EXAMPLE_SENTENCES.es]) assert.ok(!s.includes("—"), s);
});

test("word count", () => {
  assert.equal(wordCount("  I clean   houses "), 3);
  assert.equal(wordCount(""), 0);
});
