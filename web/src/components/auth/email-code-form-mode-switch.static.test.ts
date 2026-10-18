import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// TUL-1251: switching the sign-in mode (code <-> password, change email) is a client-only
// state flip. It must never submit a form or call a server action, or it would spend the
// rate-limit budget that belongs to real code requests.
const src = readFileSync(join(process.cwd(), "src/components/auth/email-code-form.tsx"), "utf8");

test("TUL-1251: the quiet mode-switch control is a type=button that only runs a state setter", () => {
  const start = src.indexOf("function QuietAction");
  const body = src.slice(start, src.indexOf("export function EmailCodeForm"));
  assert.match(body, /type="button"/);
  assert.doesNotMatch(body, /type="submit"/);
});

test("TUL-1251: every mode-switch handler only calls state setters, never a send/verify action", () => {
  const handlers = [...src.matchAll(/<QuietAction[\s\S]*?onClick=\{([\s\S]*?)\}\s*>/g)].map((m) => m[1] ?? "");
  assert.ok(handlers.length >= 3, "expected the mode-switch controls to be found");
  for (const h of handlers) {
    assert.doesNotMatch(h, /sendAction|verifyAction|requestEmailCode|submitEmailCode|requestSubmit|submit\(/, h);
  }
});

test("TUL-1251: the send action is bound only to real forms (step 1 and the explicit resend)", () => {
  const bound = [...src.matchAll(/action=\{sendAction\}/g)].length;
  assert.equal(bound, 2);
  assert.doesNotMatch(src, /useEffect\([^)]*sendAction/);
});
