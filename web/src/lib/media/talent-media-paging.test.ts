import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  TALENT_MEDIA_MAX_PAGE_SIZE,
  TALENT_MEDIA_PAGE_SIZE,
  appendUniquePage,
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

test("appendUniquePage appends a new page and skips ids already shown", () => {
  const a = [{ id: "1" }, { id: "2" }];
  assert.deepEqual(appendUniquePage(a, [{ id: "2" }, { id: "3" }]).map((x) => x.id), ["1", "2", "3"]);
  assert.equal(appendUniquePage(a, []), a);
});

test("gallery drawer shows Load more only with more rows, and blocks reorder on a partial list", () => {
  const s = src("src/components/talent/media-gallery-drawer.tsx");
  assert.ok(s.includes("{hasMore && onLoadMore && ("), "button is gated on hasMore");
  assert.ok(s.includes('admin.talent.edit.mediaGallery.loadMore"'), "uses the loadMore key");
  assert.ok(/if \(hasMore\) return;/.test(s), "drag reorder is off while rows are unloaded");
});

test("the profile editors page the gallery instead of loading all of it", () => {
  for (const p of [
    "src/app/(workspace)/[tenantSlug]/admin/roster/[id]/TalentEditForm.tsx",
    "src/components/admin/shell/internal/talent-drawers/profile-essentials.tsx",
  ]) {
    const s = src(p);
    assert.ok(s.includes("useGalleryLoadMore("), p);
    assert.ok(!s.includes("actionLoadTalentMediaBundleAll"), p);
    assert.ok(s.includes("onLoadMore={galleryPaging.loadMore}"), p);
  }
  const hook = src("src/components/talent/use-gallery-load-more.ts");
  assert.ok(hook.includes("galleryOffset: nextOffset"), "cursor comes from the server");
});

test("the Profile page hero reads one gallery row", () => {
  const s = src("src/components/admin/shell/internal/talent/shared/profile-sections-1.tsx");
  assert.ok(s.includes("{ galleryLimit: 1 }"));
});

test("Load more copy exists in en and es", () => {
  for (const [f, label] of [["messages/en.json", "Load more"], ["messages/es.json", "Cargar más"]] as const) {
    const g = JSON.parse(src(f)).admin.talent.edit.mediaGallery;
    assert.equal(g.loadMore, label);
    assert.ok(g.loadMoreLoading && g.loadMoreHint.includes("{shown}") && g.loadMoreHint.includes("{total}"));
  }
});
