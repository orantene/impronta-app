import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// TUL-886: the measured box (not a ::before hit area) is 44px on phones for these controls.
const toggle = readFileSync("src/components/marketing/marketing-language-toggle.tsx", "utf8");
const picker = readFileSync("src/components/marketing/currency-picker.tsx", "utf8");
const menu = readFileSync("src/components/marketing/marketing-language-menu.tsx", "utf8");

test("TUL-886: footer EN/ES links are 44px boxes under md", () => {
  assert.match(toggle, /max-md:min-h-11 max-md:min-w-11/);
});
test("TUL-886: the currency picker chip is 44px tall under md", () => {
  assert.match(picker, /max-md:min-h-11/);
});
test("TUL-886: the header language button keeps a 44px floor on phones", () => {
  assert.match(menu, /h-11 min-h-11 min-w-11/);
});
