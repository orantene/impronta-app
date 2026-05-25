import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveLegacyTalentPlatformPath } from "./legacy-talent-redirect";

test("talent root resolver redirects to platform /talent/today", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(workspace)/talent/page.tsx"),
    "utf8",
  );
  assert.match(src, /redirect\(`\/talent\/today/);
  assert.equal(src.includes("/${slug}/talent/today"), false);
});

test("resolveLegacyTalentPlatformPath maps slug-prefixed talent URLs", () => {
  assert.equal(resolveLegacyTalentPlatformPath("/impronta/talent/today"), "/talent/today");
  assert.equal(resolveLegacyTalentPlatformPath("/impronta/talent/site"), "/talent/site");
  assert.equal(resolveLegacyTalentPlatformPath("/impronta/talent"), "/talent");
  assert.equal(resolveLegacyTalentPlatformPath("/talent/today"), null);
  assert.equal(resolveLegacyTalentPlatformPath("/admin/talent"), null);
});

test("legacy tenant talent pages redirect to /talent/*", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/today/page.tsx"),
    "utf8",
  );
  assert.match(src, /redirectLegacyTalentPath\("today"/);
});
