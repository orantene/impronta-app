import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const web = join(__dirname, "../../../../..");
const read = (p: string) => readFileSync(join(web, p), "utf8");

test("ShellBoundary hands notFound/redirect back to Next from getDerivedStateFromError, never in render", () => {
  const src = read("src/components/admin/shell/internal/shell-boundary.tsx");
  assert.match(src, /import\s*\{\s*unstable_rethrow\s*\}\s*from\s*"next\/navigation"/);
  const gdse = src.indexOf("static getDerivedStateFromError");
  const render = src.indexOf("override render()");
  assert.ok(gdse > 0 && render > gdse, "ErrorBoundary shape moved");
  const rethrow = src.indexOf("unstable_rethrow(err)", gdse);
  assert.ok(rethrow > gdse && rethrow < render, "rethrow must run in getDerivedStateFromError");
  assert.doesNotMatch(src.slice(render), /unstable_rethrow\(/);
});

test("work detail has its own not-found screen with ES and EN copy", () => {
  const dir = "src/app/(workspace)/[tenantSlug]/admin/work/[id]";
  const nf = `${dir}/not-found.tsx`;
  assert.ok(existsSync(join(web, nf)));
  assert.match(read(nf), /WorkNotFoundCard/);
  const body = read(`${dir}/work-not-found-card.tsx`);
  for (const key of ["notFoundTitle", "notFoundBody", "backToPipeline"]) {
    assert.match(body, new RegExp(`admin\\.work\\.detail\\.${key}`));
    for (const loc of ["en", "es"]) {
      const detail = JSON.parse(read(`messages/${loc}.json`)).admin.work.detail;
      assert.equal(typeof detail[key], "string", `${loc} missing ${key}`);
    }
  }
});

test("TUL-473: a work id outside this workspace renders the card inline, not through notFound()", () => {
  const dir = "src/app/(workspace)/[tenantSlug]/admin/work/[id]";
  const page = read(`${dir}/page.tsx`);
  assert.match(page, /if \(!inquiry\) return <WorkNotFoundCard /);
  assert.doesNotMatch(page, /if \(!inquiry\) notFound\(\)/);
  // The card is a plain server component (no hooks, no client boundary) that links with next/link.
  const card = read(`${dir}/work-not-found-card.tsx`);
  assert.doesNotMatch(card, /"use client"/);
  assert.match(card, /import Link from "next\/link"/);
  assert.doesNotMatch(card, /<a\s/);
});
