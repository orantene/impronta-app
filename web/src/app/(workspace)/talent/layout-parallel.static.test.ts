/**
 * TUL-536: first paint of the Talent and Admin dashboards was slow because
 * independent reads ran as serial awaits. Pin the parallel shape so a refactor
 * cannot quietly bring the extra round trips back. Both surfaces keep a loading
 * skeleton so a slow read never shows a blank page.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("talent layout starts the owned-workspace lookup before the big batch, not after it", () => {
  const src = read("src/app/(workspace)/talent/_talent-layout-inner.tsx");
  const started = src.indexOf("const ownedWorkspaceSlugPromise = loadOwnedWorkspaceSlug(");
  const batch = src.indexOf("] = await Promise.all([");
  const awaited = src.indexOf("await ownedWorkspaceSlugPromise");
  assert.ok(started > 0 && batch > 0 && awaited > 0);
  assert.ok(started < batch, "lookup must start before the Promise.all batch");
  assert.ok(awaited > batch, "lookup is awaited after the batch has been issued");
});

test("admin layout reads session and tenant scope in one wave", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/layout.tsx");
  assert.match(
    src,
    /const \[session, scope\] = await Promise\.all\(\[\s*timed\("layout\.session"[\s\S]*?timed\("layout\.scope"/,
  );
  assert.doesNotMatch(src, /const scope = await timed\("layout\.scope"/);
});

test("both dashboards paint a skeleton while the layout loads", () => {
  assert.ok(existsSync(join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin/loading.tsx")));
  assert.ok(existsSync(join(process.cwd(), "src/app/(workspace)/talent/loading.tsx")));
  const talentLayout = read("src/app/(workspace)/talent/layout.tsx");
  assert.match(talentLayout, /<Suspense fallback=\{<TalentShellSkeleton \/>\}>/);
});
