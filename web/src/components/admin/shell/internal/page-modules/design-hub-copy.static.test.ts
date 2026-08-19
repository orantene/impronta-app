import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

/**
 * The Design hub renders a VARIABLE number of cards: the site-theme and
 * site-shell entries are each conditional on a server answer, so a tenant can
 * see two, three or four. Copy that names a count is therefore wrong for most
 * tenants — and it was: the page read "The four things" while showing three,
 * because the shell editor's flag was empty in production.
 *
 * A subtitle that counts what it cannot count is a small lie the operator sees
 * before anything else on the page.
 */
const EN = readFileSync(new URL("../../../../../../messages/en.json", import.meta.url), "utf8");
const ES = readFileSync(new URL("../../../../../../messages/es.json", import.meta.url), "utf8");
const HUB = readFileSync(new URL("./WebsiteDesignHub.tsx", import.meta.url), "utf8");

test("the design hub still renders cards conditionally", () => {
  // If this stops being true, a fixed count becomes accurate again — and this
  // test should be revisited rather than deleted.
  assert.match(HUB, /\{siteDesignUrl \? \(/);
  assert.match(HUB, /\{siteShellUrl \? \(/);
});

test("its subtitle does not promise a number of cards", () => {
  for (const [label, source] of [["en", EN], ["es", ES]] as const) {
    const subtitle = source.match(/"designHub":\s*\{[\s\S]*?"subtitle":\s*"([^"]*)"/)?.[1];
    assert.ok(subtitle, `${label}: no designHub subtitle found`);
    assert.ok(
      !/\b(four|three|two|cuatro|tres|dos)\b/i.test(subtitle!),
      `${label} subtitle counts the cards, which are conditional: "${subtitle}"`,
    );
  }
});
