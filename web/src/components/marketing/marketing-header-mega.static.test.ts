/**
 * GRK-098 (TUL-535): closed mega-menu must not enter the keyboard Tab order.
 * Opening the panel on focus forced ~26 menuitem links before the hero CTA.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const mega = readFileSync(
  join(process.cwd(), "src/components/marketing/marketing-header-mega.tsx"),
  "utf8",
);
const header = readFileSync(
  join(process.cwd(), "src/components/marketing/header.tsx"),
  "utf8",
);

/** Strip block + line comments so GRK-098 notes cannot false-positive. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

test("DesktopMegaMenu trigger does not open on focus", () => {
  const start = mega.indexOf("export function DesktopMegaMenu");
  const end = mega.indexOf("export function MobileMegaSection");
  const body = codeOnly(mega.slice(start, end));
  assert.ok(body.includes("aria-haspopup"));
  assert.ok(!/\bonFocus=\{onOpen\}/.test(body), "mega trigger must not onFocus=onOpen");
});

test("DesktopMenu trigger does not open on focus", () => {
  const start = header.indexOf("function DesktopMenu(");
  const end = header.indexOf("function MobileSection(");
  const body = codeOnly(header.slice(start, end));
  assert.ok(body.includes("aria-haspopup"));
  assert.ok(!/\bonFocus=\{onOpen\}/.test(body), "menu trigger must not onFocus=onOpen");
});
