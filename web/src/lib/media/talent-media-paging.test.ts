import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  TALENT_MEDIA_MAX_PAGE_SIZE,
  TALENT_MEDIA_PAGE_SIZE,
  computeHasMore,
  nextOffset,
  pageWindow,
} from "./talent-media-paging";

test("pageWindow defaults to the first page", () => {
  assert.deepEqual(pageWindow(), { offset: 0, limit: TALENT_MEDIA_PAGE_SIZE, from: 0, to: 59 });
});
test("pageWindow clamps junk and oversize input", () => {
  assert.equal(pageWindow(-5, 0).offset, 0);
  assert.equal(pageWindow(NaN, NaN).limit, TALENT_MEDIA_PAGE_SIZE);
  assert.equal(pageWindow(0, 99999).limit, TALENT_MEDIA_MAX_PAGE_SIZE);
  assert.deepEqual(pageWindow(60.7, 10), { offset: 60, limit: 10, from: 60, to: 69 });
});
test("hasMore is false for a library smaller than one page", () => {
  assert.equal(computeHasMore(0, 12, 12), false);
  assert.equal(nextOffset(0, 12, 12), null);
});
test("hasMore / nextOffset across pages", () => {
  assert.equal(computeHasMore(0, 60, 130), true);
  assert.equal(nextOffset(0, 60, 130), 60);
  assert.equal(computeHasMore(120, 10, 130), false);
  assert.equal(nextOffset(60, 0, 130), null);
});

const WEB = join(__dirname, "../../..");
const src = (p: string) => readFileSync(join(WEB, p), "utf8");

test("bundle loader never uses select('*'), pages with range, orders stably, checks errors", () => {
  const s = src("src/lib/media/talent-media-bundle.server.ts");
  assert.ok(!/select\(\s*["'`]\*["'`]/.test(s), "no select('*')");
  assert.ok(s.includes(".range("), "gallery is paged");
  assert.ok(s.includes(".limit("), "singletons are bounded");
  assert.ok(s.includes('.order("id"'), "stable tie-break");
  assert.equal((s.match(/if \(error\)/g) ?? []).length >= 2, true);
  assert.ok(s.includes("logServerError"));
});
test("the action delegates to the paged loader", () => {
  const s = src("src/app/(workspace)/[tenantSlug]/admin/media/actions.ts");
  const a = s.indexOf("export async function actionLoadTalentMediaBundle(");
  const body = s.slice(a, s.indexOf("// ─── Media count"));
  assert.ok(body.includes("loadTalentMediaBundle("));
  assert.ok(!/select\(\s*["'`]\*["'`]/.test(body));
});
