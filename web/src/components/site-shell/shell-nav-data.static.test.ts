import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/**
 * The shell must SUPPLY the data its drawer offers to show.
 *
 * `dataSources.socialLinks` and `availableLocales` were both reachable from the
 * schema and the panel, and reached the renderer as nothing: no producer
 * existed for either. The drawer then correctly rendered nothing — which is
 * indistinguishable from the feature not existing, and is exactly how it
 * shipped to a live site and was found by clicking.
 */
const SOURCE = readFileSync(
  new URL("./PublishedShell.tsx", import.meta.url),
  "utf8",
);

test("both shell render paths resolve the nav's data", () => {
  const calls = SOURCE.match(/resolveShellNavData\(tenantId, locale, publicPathPrefix\)/g) ?? [];
  assert.equal(
    calls.length,
    2,
    "the legacy-slot path and the freeform path each need it; one alone leaves half the tenants without a social row",
  );
});

test("the resolved data actually reaches the renderer", () => {
  const socialWiring = SOURCE.match(/socialLinks: navData\.socialLinks/g) ?? [];
  const localeWiring = SOURCE.match(/availableLocales: navData\.availableLocales/g) ?? [];
  assert.equal(socialWiring.length, 2, "social links must be passed on both paths");
  assert.equal(localeWiring.length, 2, "locales must be passed on both paths");
});

test("the locale row uses the same URL grammar as the language widget", () => {
  // Default locale unprefixed, every other one prefixed. Getting this wrong
  // sends a visitor to a 404 from inside the menu.
  assert.match(SOURCE, /code === defaultLocale/);
  assert.match(SOURCE, /\$\{publicPathPrefix\}\/\$\{code\}/);
});

test("a failed read degrades to no row, never a crash", () => {
  // The shell renders on every page; a social-links read that throws must not
  // take the site down.
  const block = SOURCE.slice(SOURCE.indexOf("async function resolveShellNavData"));
  assert.match(block.slice(0, 900), /\.catch\(\(\) => null\)/);
});
