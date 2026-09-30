import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { runPublishOnce, SITE_PUBLISHED_EVENT } from "./site-published-event";
import { editorT } from "./editor-i18n";

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

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
