import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { pageNotFoundCopy } from "./page-not-found-copy";

test("TUL-121 theme9 P2: hard-404 title follows visitor language", () => {
  const es = pageNotFoundCopy("es");
  const en = pageNotFoundCopy("en");
  assert.equal(es.title, "Página no encontrada · Tulala");
  assert.equal(es.heading, "Página no encontrada");
  assert.equal(en.title, "Page not found · Tulala");
  assert.equal(en.heading, "Page not found");
  for (const c of [es, en]) {
    assert.ok(!c.title.includes("—") && !c.title.includes("–"));
    assert.ok(!c.body.includes("—") && !c.body.includes("–"));
  }
  assert.match(es.body, /tu espacio de trabajo/i);
  assert.doesNotMatch(es.body, /\bvos\b/i);
});

test("TUL-121 theme9 P2: /_page-not-found uses locale-aware generateMetadata", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/%5Fpage-not-found/page.tsx"),
    "utf8",
  );
  assert.match(page, /export async function generateMetadata/);
  assert.match(page, /pageNotFoundCopy/);
  assert.match(page, /getRequestLocale/);
  assert.doesNotMatch(page, /export const metadata/);
  assert.doesNotMatch(page, /Page not found — Tulala/);
});
