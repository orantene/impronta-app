import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runPublishOnce, SITE_PUBLISHED_EVENT } from "./site-published-event";
import { editorT } from "./editor-i18n";
import { blankComments } from "../../lib/quality/supabase-unchecked-read";

const read = (rel: string) => blankComments(readFileSync(join(process.cwd(), "src", rel), "utf8"));

test("F104: a second publish while one is pending is dropped", async () => {
  let runs = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const first = runPublishOnce(async () => {
    runs += 1;
    await gate;
  });
  const second = await runPublishOnce(async () => {
    runs += 1;
  });
  assert.equal(second, false);
  release();
  assert.equal(await first, true);
  assert.equal(runs, 1);
  // The flag clears afterwards (and after a throw).
  assert.equal(await runPublishOnce(async () => {}), true);
  await assert.rejects(runPublishOnce(async () => { throw new Error("x"); }));
  assert.equal(await runPublishOnce(async () => {}), true);
});

test("F104: drawer closes and announces on success, guards double submit", () => {
  const src = read("components/edit-chrome/publish-drawer.tsx");
  assert.match(src, /runPublishOnce\(runPublish\)/);
  assert.match(src, /announceSitePublished\(res\.publishedAt\)/);
  assert.match(src, /surfaceKind === "talent_page"\) closePublish\(\)/);
  assert.ok(src.includes('t("Open full")'));
  assert.match(src, /formatPublishedAt\(lastPublishedAt, editorLocale\)/);
});

test("F104: the chip listens, refreshes and toasts with a View site link", () => {
  const src = read("components/edit-chrome/talent-draft-chip.tsx");
  assert.ok(src.includes("SITE_PUBLISHED_EVENT"));
  assert.match(src, /data-site-published-toast/);
  assert.match(src, /copyOf\("sitePublished"\)/);
  assert.equal(SITE_PUBLISHED_EVENT, "tulala:site-published");
});

test("F104: the stray Retry came from the agency-only builder diff; talents skip it", () => {
  const src = read("components/edit-chrome/publish-drawer.tsx");
  assert.match(src, /surfaceKind === "talent_page"\) return;/);
  assert.match(src, /surfaceKind !== "talent_page" && \(/);
});

test("F104: ES copy", () => {
  assert.equal(editorT("Open full", "es"), "Abrir completo");
  assert.equal(editorT("Publishing…", "es"), "Publicando...");
});

test("F95b: the drawer's open-reset effect does not depend on pageMetadata (a refresh must not wipe the loaded snapshot)", () => {
  const src = read("components/edit-chrome/publish-drawer.tsx");
  assert.match(src, /\}, \[publishOpen, surfaceKind\]\);/);
  assert.doesNotMatch(src, /\}, \[publishOpen, pageMetadata, surfaceKind\]\);/);
  assert.match(src, /pageMetaRef\.current\?\.title/);
});

test("F95b: Valeria's real input shape (5 published nodes, page row) yields a loaded snapshot, not a failure", async () => {
  const { talentPublishedSnapshotResult } = await import("../../lib/site-admin/edit-mode/talent-published-snapshot");
  const r = talentPublishedSnapshotResult({
    blocks_published: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }],
    published_at: "2026-09-30T19:18:14.606+00:00",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.hasPublishedSnapshot, true);
    assert.equal(r.publishedBuilderTree?.length, 5);
    assert.deepEqual(r.rows, []);
  }
});
