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
import * as emailDraft from "./email-draft";
import { join } from "node:path";

test("TUL-766: the code form restores, remembers and forgets the step", () => {
  const src = readFileSync(join(process.cwd(), "src/components/auth/email-code-form.tsx"), "utf8");
  assert.match(src, /hasCodeStepParam\(window\.location\.search\)/);
  assert.match(src, /rememberCodeStep\(window\.sessionStorage, codeStepEmail/);
  assert.match(src, /forgetCodeStep\(window\.sessionStorage\)/);
  assert.match(src, /setBackToEmail\(true\); setRestoredEmail\(undefined\)/);
});

test("TUL-766: reload on ?step=code lands on the code step with the same email; a stale or missing entry falls back to step 1 and strips the param", () => {
  const s = mem();
  // send: the form remembers the address and marks the URL
  rememberCodeStep(s, "ana@example.com", 10_000);
  const afterSend = urlWithCodeStep("/login?as=client&next=%2Faccount", true);
  // reload: the page sees the marker and recalls the address
  assert.equal(hasCodeStepParam(afterSend.slice(afterSend.indexOf("?"))), true);
  assert.equal(recallCodeStep(s, 20_000), "ana@example.com");
  assert.equal(recallCodeStep(s, 20_000), "ana@example.com", "a second reload still works");
  // too late (or storage cleared): back to step 1 and the marker is removed
  assert.equal(recallCodeStep(s, 10_000 + CODE_STEP_TTL_MS + 1), null);
  assert.equal(urlWithCodeStep(afterSend, false), "/login?as=client&next=%2Faccount");
  // an unrelated step value is never treated as the code step
  assert.equal(hasCodeStepParam("?step=other"), false);
});

test("TUL-768: password <-> code switch keeps the typed email, and the password is never stored anywhere", () => {
  const s = mem();
  emailDraft.writeAuthEmailDraft("ana@example.com");
  // password -> code and code -> password both read the same draft
  assert.equal(emailDraft.pickAuthEmail(emailDraft.readAuthEmailDraft(), "default@example.com"), "ana@example.com");
  rememberCodeStep(s, "ana@example.com", 1);
  const stored = s.getItem("tulala.auth.codeStep") ?? "";
  assert.deepEqual(Object.keys(JSON.parse(stored)).sort(), ["at", "email"]);
  assert.doesNotMatch(stored, /pass/i);
  // the draft module only holds email and name: no password accessor exists to survive a switch
  assert.deepEqual(Object.keys(emailDraft).filter((k) => /pass/i.test(k)), []);
  emailDraft.writeAuthEmailDraft("");
});
