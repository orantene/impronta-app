/**
 * Phase C — round-trip determinism tests for the marker grammar.
 *
 * Run via `node --test` (project-wide convention). Locks the property
 * `serialize(tokenize(s)) === s` for every checked-in fixture string.
 * Fixtures live in `./fixtures.ts` and cover:
 *
 *   - the empty string
 *   - plain text (no markers)
 *   - each individual marker in isolation
 *   - sequences of multiple markers
 *   - whitespace around markers (preservation)
 *   - punctuation adjacent to markers
 *   - sanitized real-world strings drawn from production sites
 *
 * If a future commit breaks round-trip determinism, this test fires and
 * blocks CI. Per the migration-pass plan §6, byte-identical round-trip
 * is the contract.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { tokenize, serialize, isPlainText } from "./tokens";
import { ROUND_TRIP_FIXTURES, GHOST_MARKER_FIXTURES } from "./fixtures";

test("round-trip determinism — every checked-in fixture", () => {
  for (const input of ROUND_TRIP_FIXTURES) {
    const tokens = tokenize(input);
    const output = serialize(tokens);
    assert.equal(
      output,
      input,
      `round-trip drift on input ${JSON.stringify(input)} → ${JSON.stringify(output)}`,
    );
  }
});

test("isPlainText agrees with tokenize having zero markers", () => {
  for (const input of ROUND_TRIP_FIXTURES) {
    const tokens = tokenize(input);
    const hasMarker = tokens.some((t) => t.kind !== "text");
    assert.equal(
      isPlainText(input),
      !hasMarker,
      `isPlainText disagrees on ${JSON.stringify(input)}`,
    );
  }
});

test("ghost-marker collapse: empty markers serialize to empty string", () => {
  for (const [input, expected] of GHOST_MARKER_FIXTURES) {
    const output = serialize(tokenize(input));
    assert.equal(
      output,
      expected,
      `ghost-marker collapse failed on ${JSON.stringify(input)} → ${JSON.stringify(output)}`,
    );
  }
});

test("tokenize splits on each marker independently", () => {
  // Sanity: a known-shaped input produces the expected token sequence.
  const input = "Welcome to {accent}Impronta{/accent} — book your {b}team{/b}.";
  const tokens = tokenize(input);
  assert.deepEqual(tokens, [
    { kind: "text", text: "Welcome to " },
    { kind: "accent", text: "Impronta" },
    { kind: "text", text: " — book your " },
    { kind: "bold", text: "team" },
    { kind: "text", text: "." },
  ]);
});

test("link tokenization preserves URL exactly", () => {
  const input = "Click [here](https://example.com/path?q=1&r=2) please.";
  const tokens = tokenize(input);
  assert.deepEqual(tokens, [
    { kind: "text", text: "Click " },
    { kind: "link", text: "here", url: "https://example.com/path?q=1&r=2" },
    { kind: "text", text: " please." },
  ]);
  // And byte-identical round-trip.
  assert.equal(serialize(tokens), input);
});
