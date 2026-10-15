/**
 * TUL-593: the header slogan is "Sell what you do", tucked under the logo at every width.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getMarketingCopy } from "@/lib/marketing/copy";

const header = readFileSync(join(process.cwd(), "src/components/marketing/header.tsx"), "utf8");

test("TUL-593: slogan strings are short, no em dashes", () => {
  assert.equal(getMarketingCopy("en").brand.descriptor, "Sell what you do");
  assert.equal(getMarketingCopy("es").brand.descriptor, "Vende lo que haces");
});

test("TUL-593: slogan sits under the logo at every width, with a tight gap", () => {
  const logo = header.slice(header.indexOf("function TulalaHeaderLogo"));
  assert.match(logo, /mt-0\.5/);
  assert.doesNotMatch(logo, /hidden[^"]*sm:block/);
  assert.ok(!header.includes("-mt-1 text-[0.5625rem]"), "no separate phone row");
});

test("TUL-593: the main padding matches the single-row header", () => {
  const shell = readFileSync(join(process.cwd(), "src/components/marketing/shell.tsx"), "utf8");
  assert.match(shell, /pt-\[var\(--plt-header-h,64px\)\]/);
});
