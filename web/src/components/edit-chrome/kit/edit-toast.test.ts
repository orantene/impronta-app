/**
 * edit-toast.test.ts — tone → palette contract for the ONE EditToast (W2-C2).
 *
 * Pins that every tone resolves to a palette drawn from the token kit, and that
 * the attention/error tones use the COOL blue / rose roles — never gold/rust
 * (owner rule; the static guard scans hex literals, this pins the token wiring).
 *
 * Run: node_modules/.bin/tsx --test src/components/edit-chrome/kit/edit-toast.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { editToastPalette } from "./edit-toast";
import { CHROME } from "./tokens";

test("every tone returns a fully-populated palette", () => {
  for (const tone of ["neutral", "success", "attention", "error"] as const) {
    const p = editToastPalette(tone);
    for (const key of ["bg", "border", "text", "icon"] as const) {
      assert.ok(
        typeof p[key] === "string" && p[key].length > 0,
        `${tone}.${key} is a non-empty string`,
      );
    }
  }
});

test("success tone uses the green role", () => {
  const p = editToastPalette("success");
  assert.equal(p.text, CHROME.green);
  assert.equal(p.bg, CHROME.greenBg);
});

test("attention tone uses the COOL blue role, not gold/rust", () => {
  const p = editToastPalette("attention");
  assert.equal(p.text, CHROME.blue);
  assert.equal(p.bg, CHROME.blueBg);
  // Cool blue token — must not be the banned rust-gold family.
  assert.doesNotMatch(p.text, /#b45309/i);
  assert.doesNotMatch(p.bg, /180\s*,\s*83\s*,\s*9/);
});

test("error tone uses the rose role", () => {
  const p = editToastPalette("error");
  assert.equal(p.text, CHROME.rose);
  assert.equal(p.bg, CHROME.roseBg);
});

test("neutral tone uses surface/line/text tokens", () => {
  const p = editToastPalette("neutral");
  assert.equal(p.bg, CHROME.surface);
  assert.equal(p.text, CHROME.text2);
});
