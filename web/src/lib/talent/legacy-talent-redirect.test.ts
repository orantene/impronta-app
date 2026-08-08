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

// A1 audit — this pure function has no concept of locale codes, so a locale
// segment that precedes "talent" (e.g. "/es/talent/register") reads exactly
// like a legacy tenant-slug prefix and WOULD be rewritten to "/talent/register",
// silently dropping the visitor's /es/. This is a real, confirmed root cause of
// the double-hop (verified live pre-fix: /es/talent/register -> 308 -> plain
// /talent/register). It does NOT reproduce for "/client/register" — this
// resolver only ever matches a literal "talent" second segment.
//
// The fix is NOT here: this function must stay locale-agnostic (it has no
// LanguageSettings to consult, and legacy tenant slugs are a DB-driven,
// unbounded set that can't be told apart from a locale code by shape alone).
// The guard lives at the one call site, web/src/proxy.ts (search "A1: isTenantSlugCandidate"),
// which skips calling this resolver entirely whenever the path already carries
// a known non-default locale prefix — locale always wins that ambiguity,
// consistent with how the rest of proxy.ts orders locale-stripping before
// every other path-based tenant resolution.
test("A1: resolveLegacyTalentPlatformPath alone still can't tell a locale code from a tenant slug (documents WHY the guard is in proxy.ts, not here)", () => {
  assert.equal(resolveLegacyTalentPlatformPath("/es/talent/register"), "/talent/register");
  assert.equal(resolveLegacyTalentPlatformPath("/es/client/register"), null);
});

test("legacy tenant talent pages redirect to /talent/*", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/today/page.tsx"),
    "utf8",
  );
  assert.match(src, /redirectLegacyTalentPath\("today"/);
});
