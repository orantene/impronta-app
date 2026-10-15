import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { PRESENCE_ES_TEXT } from "../../../../../talent/studio/presence-es-text";

// TUL-729: the Settings "Help and support" row opens HelpDrawer, which holds
// shortcuts, the help centre link and a support request. It has no FAQ list and
// no payments help, so the row must not promise them.
const settings = readFileSync(new URL("./SettingsPage.tsx", import.meta.url), "utf8");
const wave2 = readFileSync(new URL("../../wave2.tsx", import.meta.url), "utf8");

function helpSub(): string {
  const m = /key: "help",[\s\S]*?sub: tx\("([^"]+)"\)/.exec(settings);
  assert.ok(m, "help row sub copy found");
  return m[1];
}

test("help drawer really has no FAQ or payouts section", () => {
  const drawer = wave2.slice(wave2.indexOf("export function HelpDrawer"), wave2.indexOf("const helpRowStyle"));
  assert.doesNotMatch(drawer, /faq|payout|payment/i);
});

test("help row EN copy promises only what the drawer has", () => {
  assert.doesNotMatch(helpSub(), /common questions|faq|payout|payment/i);
});

test("help row has an ES translation that agrees", () => {
  const es = PRESENCE_ES_TEXT[helpSub()];
  assert.ok(es, "ES entry exists");
  assert.doesNotMatch(es, /frecuentes|pagos/i);
});
