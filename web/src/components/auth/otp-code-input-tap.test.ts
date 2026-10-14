import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { firstEmptyIndex } from "./otp-code-input";

test("TUL-826: a tap on the code row lands on the first empty box", () => {
  assert.equal(firstEmptyIndex(["", "", ""]), 0);
  assert.equal(firstEmptyIndex(["1", "2", ""]), 2);
  assert.equal(firstEmptyIndex(["1", "2", "3"]), 2);
  assert.equal(firstEmptyIndex([]), 0);
});

test("the row is one tap target; first box keeps autofocus and one-time-code", () => {
  const s = readFileSync(join(process.cwd(), "src/components/auth/otp-code-input.tsx"), "utf8");
  assert.match(s, /focusBox\(firstEmptyIndex\(digits\)\)/);
  assert.match(s, /autoComplete=\{i === 0 \? "one-time-code" : "off"\}/);
  assert.match(s, /autoFocus=\{i === 0\}/);
  assert.match(s, /onPaste=\{onPaste\(i\)\}/);
});
