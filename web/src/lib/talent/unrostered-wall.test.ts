import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// TUL-117 (C1-12, DS-41): the "Profile created, you're in" roster wall is
// retired. Every pro has a dashboard, so /talent always lands on Today.

test("the wall modules are gone", () => {
  assert.equal(existsSync(join(process.cwd(), "src/lib/talent/unrostered-wall.ts")), false);
  assert.equal(existsSync(join(process.cwd(), "src/lib/talent/unrostered-wall-load.ts")), false);
});

test("the talent root redirects a profiled talent to Today and renders no wall", () => {
  const page = readFileSync(
    join(process.cwd(), "src/app/(workspace)/talent/page.tsx"),
    "utf8",
  );
  assert.match(page, /loadTalentSelfProfileByUser/);
  assert.match(page, /redirect\(`\/talent\/today\$\{querySuffix\}`\)/);
  assert.doesNotMatch(page, /unrostered/i);
  assert.doesNotMatch(page, /you&apos;re in|you're in/);
  assert.doesNotMatch(page, /<h1/);
  assert.doesNotMatch(page, /\.maybeSingle\(\)/);
});

test("the talent layout never skips the shell for the talent root", () => {
  const layout = readFileSync(
    join(process.cwd(), "src/app/(workspace)/talent/layout.tsx"),
    "utf8",
  );
  assert.doesNotMatch(layout, /unrostered/i);
  assert.match(layout, /<TalentShellClient/);
});

test("platform talent routes keep the path, so Money is not rewritten onto Today", () => {
  const ctx = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/state/context.tsx"),
    "utf8",
  );
  const skips = ctx.match(/tenantSlugRef\.current \|\| platformTalentRoutesRef\.current/g) ?? [];
  assert.ok(skips.length >= 2);
});

test("the talent route syncer does not navigate, so Money cannot be pushed back to Today", () => {
  const syncer = readFileSync(
    join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/_talent-page-route-syncer.tsx"),
    "utf8",
  );
  assert.match(syncer, /navigate:\s*false/);
  assert.doesNotMatch(syncer, /setTalentPage\(page\)/);
});
