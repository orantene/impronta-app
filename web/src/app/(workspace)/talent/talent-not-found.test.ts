import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const dir = __dirname;

test("TUL-670: /talent has its own not-found segment", () => {
  assert.ok(existsSync(join(dir, "not-found.tsx")));
});

test("TUL-670: talent 404 follows the dashboard language", async () => {
  const { talentNotFoundCopy } = await import("./_talent-not-found-copy");
  assert.equal(talentNotFoundCopy("es").title, "Página no encontrada");
  assert.equal(talentNotFoundCopy("es-MX").home, "Volver a Hoy");
  assert.equal(talentNotFoundCopy("en").title, "Page not found");
  assert.equal(talentNotFoundCopy(null).title, "Page not found");
});

test("TUL-670: segment uses the dashboard locale hook, next/link, and fills the viewport", () => {
  const src = readFileSync(join(dir, "not-found.tsx"), "utf8");
  assert.match(src, /useDashboardLocale\(\)/);
  assert.doesNotMatch(src, /getRequestLocale/);
  assert.match(src, /from "next\/link"/);
  assert.doesNotMatch(src, /minHeight:\s*"70vh"/);
  assert.doesNotMatch(src, /—/);
});
