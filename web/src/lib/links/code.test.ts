/**
 * Codes: the readable default, and the opaque carve-out for links that grant.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CODE_ALPHABET,
  CODE_PATTERN,
  OPAQUE_CODE_LENGTH,
  OPAQUE_CODE_MIN_LENGTH,
  generateOpaqueCode,
  validateCode,
} from "./code";

test("a generated opaque code satisfies the same format the database enforces", () => {
  // If the generator can emit something links_code_format rejects, the failure
  // surfaces as a constraint violation on someone's first private link.
  for (let i = 0; i < 200; i += 1) {
    const code = generateOpaqueCode();
    assert.match(code, CODE_PATTERN, `generated ${code}`);
    assert.equal(code.length, OPAQUE_CODE_LENGTH);
  }
});

test("no confusable pair survives in the alphabet", () => {
  // The two pairs a person misreads off a printed card are 0/o and 1/l. What
  // matters is that no pair survives INTACT — the ambiguity is between the
  // members, not in either character alone — so at most one of each may
  // appear. (Today: 1 survives its pair, and neither 0 nor o does.)
  for (const [a, b] of [["0", "o"], ["1", "l"]] as const) {
    const present = [a, b].filter((ch) => CODE_ALPHABET.includes(ch));
    assert.ok(
      present.length <= 1,
      `${a} and ${b} are misread for each other; at most one may be in the alphabet, found ${JSON.stringify(present)}`,
    );
  }
  // No duplicates, or the "every symbol appears" check below is measuring the
  // wrong denominator.
  assert.equal(new Set(CODE_ALPHABET).size, CODE_ALPHABET.length);
});

test("generateOpaqueCode refuses a length that would not be opaque", () => {
  // Rather than quietly producing a short "opaque" code, which is the failure
  // that reads as solved.
  assert.throws(() => generateOpaqueCode(8), /at least 16/);
  assert.throws(() => generateOpaqueCode(OPAQUE_CODE_MIN_LENGTH - 1), /at least 16/);
  assert.doesNotThrow(() => generateOpaqueCode(OPAQUE_CODE_MIN_LENGTH));
});

test("two generated codes differ, and the generator is not obviously biased", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i += 1) seen.add(generateOpaqueCode());
  assert.equal(seen.size, 500, "500 generated codes should all be distinct");

  // Every alphabet symbol should show up across 500 x 20 characters. A
  // generator stuck on a subset would pass the distinctness check above.
  const used = new Set([...seen].join("").split(""));
  assert.equal(used.size, CODE_ALPHABET.length, "every symbol should appear");
});

test("a readable code is accepted short, because that is the point of it", () => {
  assert.deepEqual(validateCode("t7", "readable"), { ok: true });
  assert.deepEqual(validateCode("door", "readable"), { ok: true });
  assert.deepEqual(validateCode("reserve", "readable"), { ok: true });
});

test("a SHORT code claiming to be opaque is refused, so the mode cannot be a label", () => {
  const result = validateCode("t7", "opaque");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /16/);
});

test("codes that a person cannot type or a URL cannot carry are refused", () => {
  for (const bad of ["T7", "my_code", "-lead", "trail-", "", "sp ace", "café"]) {
    assert.equal(validateCode(bad, "readable").ok, false, `should refuse ${JSON.stringify(bad)}`);
  }
});

test("a code longer than the column allows is refused", () => {
  assert.equal(validateCode("a".repeat(33), "readable").ok, false);
  assert.equal(validateCode("a".repeat(32), "readable").ok, true);
});
