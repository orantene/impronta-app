/**
 * detect-url.test.ts — the cases that decide whether the import ever fires.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { detectLink, displayHost } from "./detect-url";

test("a full https URL is returned unchanged", () => {
  const d = detectLink("see https://glowstudio.mx/services please");
  assert.ok(d);
  assert.equal(d.url, "https://glowstudio.mx/services");
  assert.equal(d.inferred, false);
});

test("trailing sentence punctuation is stripped", () => {
  const d = detectLink("we are at glowstudio.mx.");
  assert.ok(d);
  assert.equal(d.url, "https://glowstudio.mx");
  assert.equal(d.raw, "glowstudio.mx");
  assert.equal(d.inferred, true);
});

test("an @handle becomes an Instagram URL", () => {
  const d = detectLink("find me @glowstudio");
  assert.ok(d);
  assert.equal(d.url, "https://www.instagram.com/glowstudio/");
  assert.equal(d.raw, "@glowstudio");
  assert.equal(d.inferred, true);
});

test("a bare domain with a path is kept", () => {
  const d = detectLink("instagram.com/glowstudio");
  assert.ok(d);
  assert.equal(d.url, "https://instagram.com/glowstudio");
});

test("a sentence with no link returns null", () => {
  assert.equal(detectLink("I do nails from home in Tulum"), null);
});

test("displayHost strips www", () => {
  assert.equal(displayHost("https://www.glowstudio.mx/x"), "glowstudio.mx");
});
