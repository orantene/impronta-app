import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CODE_STEP_TTL_MS, forgetCodeStep, hasCodeStepParam, recallCodeStep, rememberCodeStep, urlWithCodeStep, type StepStorage,
} from "./code-step-url";

function mem(): StepStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

test("TUL-766: the URL gets ?step=code, keeps the other params, and never carries the email", () => {
  assert.equal(urlWithCodeStep("/register?as=client&next=%2Faccount", true), "/register?as=client&next=%2Faccount&step=code");
  assert.equal(urlWithCodeStep("/register?as=client&step=code", false), "/register?as=client");
  assert.equal(urlWithCodeStep("/register?as=client", false), "/register?as=client");
  assert.doesNotMatch(urlWithCodeStep("/register", true), /@/);
  assert.equal(hasCodeStepParam("?as=client&step=code"), true);
  assert.equal(hasCodeStepParam("?as=client"), false);
});

test("TUL-766: the address is recalled within the window, dropped after it, and forgotten on demand", () => {
  const s = mem();
  rememberCodeStep(s, "ana@example.com", 1000);
  assert.equal(recallCodeStep(s, 1000 + 60_000), "ana@example.com");
  assert.equal(recallCodeStep(s, 1000 + CODE_STEP_TTL_MS + 1), null);
  assert.equal(recallCodeStep(s, 1000 + 60_000), null, "expired entries are removed");
  rememberCodeStep(s, "ana@example.com", 5000);
  forgetCodeStep(s);
  assert.equal(recallCodeStep(s, 5001), null);
  s.setItem("tulala.auth.codeStep", "not json");
  assert.equal(recallCodeStep(s, 1), null);
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

test("TUL-766: the code form restores, remembers and forgets the step", () => {
  const src = readFileSync(join(process.cwd(), "src/components/auth/email-code-form.tsx"), "utf8");
  assert.match(src, /hasCodeStepParam\(window\.location\.search\)/);
  assert.match(src, /rememberCodeStep\(window\.sessionStorage, codeStepEmail/);
  assert.match(src, /forgetCodeStep\(window\.sessionStorage\)/);
  assert.match(src, /setBackToEmail\(true\); setRestoredEmail\(undefined\)/);
});
