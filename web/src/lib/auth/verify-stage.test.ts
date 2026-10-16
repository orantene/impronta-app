import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { verifyProgressPercent, verifyStageAt } from "./verify-stage";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("TUL-769 stages advance with elapsed time", () => {
  assert.equal(verifyStageAt(0), 0);
  assert.equal(verifyStageAt(2499), 0);
  assert.equal(verifyStageAt(2500), 1);
  assert.equal(verifyStageAt(6000), 2);
  assert.equal(verifyStageAt(60000), 2);
});

test("TUL-769 progress always moves and never reaches 100", () => {
  assert.ok(verifyProgressPercent(0) >= 8);
  assert.ok(verifyProgressPercent(3000) > verifyProgressPercent(500));
  assert.ok(verifyProgressPercent(10 * 60_000) < 100);
});

test("TUL-769 signup confirm shows staged progress with aria-live, strings in both locales", () => {
  assert.match(read("src/components/auth/signup-code-confirm.tsx"), /<VerifyProgress/);
  assert.match(read("src/components/auth/verify-progress.tsx"), /aria-live="polite"/);
  for (const f of ["messages/en.json", "messages/es.json"]) {
    const m = JSON.parse(read(f)) as { public: { auth: { signupCode: Record<string, string> } } };
    for (const k of ["progressVerifying", "progressCreating", "progressSetup"]) {
      assert.ok(m.public.auth.signupCode[k], `${f} ${k}`);
      assert.doesNotMatch(m.public.auth.signupCode[k], /—/);
    }
  }
});

