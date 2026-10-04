/**
 * Builder WYSIWYG: catalog chrome locale must prefer visitorLocale (site
 * locale) over contentLocale (editor language toggle). Regression for P0
 * builder≠live — next_free_chip EN on canvas / ES on live; Folio masthead
 * AUTUMN vs Otoño.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const renderSrc = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"), "utf8");

function localeArgForCase(kind: string): string {
  const idx = renderSrc.indexOf(`case "${kind}"`);
  assert.ok(idx >= 0, `missing case ${kind}`);
  const slice = renderSrc.slice(idx, idx + 800);
  const line = slice.split("\n").find((l) => /locale=\{?options\./.test(l) || /locale:\s*options\./.test(l));
  assert.ok(line, `${kind} must pass locale from options`);
  return line!;
}

test("next_free_chip prefers visitorLocale over contentLocale", () => {
  const line = localeArgForCase("next_free_chip");
  assert.match(
    line,
    /visitorLocale\s*\?\?\s*options\.contentLocale\?\.locale/,
    "next_free_chip must prefer visitorLocale (site) over editor contentLocale",
  );
  assert.doesNotMatch(
    line,
    /contentLocale\?\.locale\s*\?\?\s*options\.visitorLocale/,
    "next_free_chip must not let editor EN override site ES",
  );
});

test("masthead prefers visitorLocale over contentLocale", () => {
  const line = localeArgForCase("masthead");
  assert.match(
    line,
    /visitorLocale\s*\?\?\s*options\.contentLocale\?\.locale/,
    "masthead season line must prefer visitorLocale",
  );
});
