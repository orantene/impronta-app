/**
 * onb1-13 — Escribir tab: direct placeholder, no voice confirm, no double ring.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/onboarding/steps/onb1-13-entry.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(join(dir, "entry-step.tsx"), "utf8");
const mod = readFileSync(join(dir, "../onboarding-module.tsx"), "utf8");
const es = readFileSync(join(dir, "../../../../messages/es.json"), "utf8");
const en = readFileSync(join(dir, "../../../../messages/en.json"), "utf8");

test("type mode uses typePlaceholderDirect; voice keeps Or-write placeholder", () => {
  assert.match(entry, /typePlaceholderDirect/);
  assert.match(entry, /mode === "voice"/);
  assert.match(es, /"typePlaceholderDirect": "Escribe qué haces…"/);
  assert.match(en, /"typePlaceholderDirect": "Type what you do…"/);
});

test("typed Send skips confirmWords (onSendTyped)", () => {
  assert.match(entry, /mode === "type"\) onSendTyped\(\)/);
  assert.match(mod, /onSendTyped=\{\(\) => void send\(state\.text\)\}/);
});

test("entry box text controls suppress focus ring (onb1-13 double border)", () => {
  assert.match(entry, /focus:ring-0/);
  assert.match(entry, /data-onb-entry-box/);
});
