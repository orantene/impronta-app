/**
 * P4: `?demo=` allow-list. Only gallery-meta demo-talent sources resolve;
 * raw ids, unknown codes, planned demos and cross-design params do not.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { GALLERY_DESIGNS } from "@/lib/talent-site/theme-catalog/gallery-meta";
import { allowedDemoProfileCodes, resolveDemoPreviewSource } from "./demo-preview-source";

test("a built demo-talent demo resolves to its gallery-meta profile code", () => {
  const src = resolveDemoPreviewSource("folio", "folio:commercial-model");
  assert.deepEqual(src, {
    designSlug: "folio",
    demoKey: "commercial-model",
    profileCode: "TAL-93109",
    siteSlug: "priya-shah",
  });
});

test("every resolvable profile code is listed in gallery-meta", () => {
  const allowed = allowedDemoProfileCodes();
  for (const d of GALLERY_DESIGNS) {
    for (const demo of d.demos) {
      const src = resolveDemoPreviewSource(d.slug, `${d.slug}:${demo.key}`);
      if (src) assert.ok(allowed.has(src.profileCode));
      if (demo.status !== "built" || demo.source.kind !== "demo-talent") assert.equal(src, null);
    }
  }
});

test("rejects anything outside the allow-list", () => {
  for (const bad of [
    null,
    "",
    "folio",
    "folio:illustrator", // planned
    "maison:nails", // maison-seed, not a demo talent
    "folio:dj", // demo of another design
    "frame:dj", // valid demo but wrong route design
    "folio:TAL-93109",
    "folio:00000000-0000-0000-0000-000000000000",
    "folio:commercial-model;drop",
    "../folio:commercial-model",
  ]) {
    assert.equal(resolveDemoPreviewSource("folio", bad), null, String(bad));
  }
});

test("theme preview wires the allow-list before loading a demo profile", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), "src/app/template-preview/[key]");
  const preview = readFileSync(join(dir, "theme-preview.tsx"), "utf8");
  assert.match(preview, /resolveDemoPreviewSource\(designSlug, demo\)/);
  const hydration = readFileSync(join(dir, "demo-preview-hydration.ts"), "utf8");
  assert.match(hydration, /requireTalentSelf/);
  assert.match(hydration, /eq\("profile_code", source\.profileCode\)/);
});
