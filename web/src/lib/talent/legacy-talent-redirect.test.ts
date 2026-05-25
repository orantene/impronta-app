import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("talent root resolver redirects to platform /talent/today", () => {
  const src = readFileSync(join(process.cwd(), "src/app/talent/page.tsx"), "utf8");
  assert.match(src, /redirect\(`\/talent\/today/);
  assert.equal(src.includes("/${slug}/talent/today"), false);
});

test("legacy tenant talent pages redirect to /talent/*", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/today/page.tsx"),
    "utf8",
  );
  assert.match(src, /redirectLegacyTalentPath\("today"/);
});
