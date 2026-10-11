/**
 * GRK-030: talent Max site render wires siteLocales into utility_bar headers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "render-max-site-document.tsx"), "utf8");
const chrome = readFileSync(
  join(here, "../../site-admin/sections/site_header/header-site-chrome.tsx"),
  "utf8",
);

test("render-max-site-document paints utility_bar siteLocales and suppresses the socket duplicate", () => {
  assert.match(src, /utilityBarLocales/);
  assert.match(src, /builderTreeHasKind\(headerTree, "utility_bar"\)/);
  assert.match(src, /siteLocales: utilityBarLocales/);
  assert.match(src, /headerHasLanguageSwitch/);
  assert.match(src, /headerShowsLanguageSwitch\(headerTree\) \|\| Boolean\(utilityBarLocales\)/);
});

test("header language item stays visible on phone even when a seed pins it to the menu", () => {
  assert.match(chrome, /if \(item\.type === "language"\) return "show";/);
  assert.match(chrome, /"data-bp-mobile": headerItemMobileResolved\(item\)/);
});
