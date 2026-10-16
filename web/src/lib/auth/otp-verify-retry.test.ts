import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-779 Confirm stays rendered with a pending state and the input refocuses on re-enable", () => {
  const confirm = read("src/components/auth/signup-code-confirm.tsx");
  assert.match(confirm, /<AuthSubmitButton\s+pending=\{verifying\}/);
  assert.doesNotMatch(confirm, /verifying\s*\?\s*null|!verifying\s*&&/);
  assert.match(confirm, /clearCount/);
  const otp = read("src/components/auth/otp-code-input.tsx");
  assert.match(otp, /wasDisabled/);
});
