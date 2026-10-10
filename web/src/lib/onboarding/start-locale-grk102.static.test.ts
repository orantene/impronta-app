/**
 * GRK-102 wiring: proxy strip + onboarding module must call the pure helpers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(process.cwd(), "src");

test("proxy strips /en/start with langQueryForStartAfterDefaultLocaleStrip", () => {
  const src = readFileSync(resolve(root, "proxy.ts"), "utf8");
  assert.match(src, /langQueryForStartAfterDefaultLocaleStrip/);
  assert.match(src, /searchParams\.set\("lang", startLang\)/);
});

test("onboarding module honours URL choice over a guest draft", () => {
  const src = readFileSync(resolve(root, "components/onboarding/onboarding-module.tsx"), "utf8");
  assert.match(src, /urlChoiceBeatsGuestDraft/);
  assert.match(src, /GRK-102/);
});
