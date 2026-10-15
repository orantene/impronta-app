import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// TUL-16 (a): a passwordless account (magic link / Google) must have a way back
// in from the DEFAULT /login screen, not only from /login?as=client.
const page = readFileSync(join(__dirname, "page.tsx"), "utf8");

test("default /login lane offers the email-code sign-in", () => {
  const defaultLane = page.slice(page.indexOf(") : ("));
  assert.match(defaultLane, /<EmailCodeForm/);
  assert.match(defaultLane, /startWithPassword/);
  assert.match(defaultLane, /allowCreate=\{false\}/);
});

test("every EmailCodeForm on /login is sign-in only (never creates accounts)", () => {
  const forms = page.split("<EmailCodeForm").slice(1);
  assert.ok(forms.length >= 2);
  for (const f of forms) assert.match(f.slice(0, 600), /allowCreate=\{false\}/);
});
