import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPlatformLabBuilderConfig,
  buildTalentPageBuilderConfig,
  buildThemeTemplateBuilderConfig,
} from "./config";
import type { BuilderSurfaceAdapter } from "./surface-adapter";
import { BUILDER_SURFACE_KINDS } from "./surface-kind";
import { createThemeTemplateAdapter } from "./adapters/theme-template-adapter-core";

const adapterOf = (kind: string) => ({ kind }) as unknown as BuilderSurfaceAdapter;
const themeAdapter = createThemeTemplateAdapter("folio", "home", {
  loadTree: async () => ({ ok: false, error: "x" }),
  saveTree: async () => ({ ok: false, error: "x" }),
});

test("theme_template is a registered surface kind", () => {
  assert.ok(BUILDER_SURFACE_KINDS.includes("theme_template"));
});

test("theme_template config rejects a non-theme_template adapter", () => {
  assert.throws(() => buildThemeTemplateBuilderConfig(adapterOf("platform_lab")));
});

test("theme_template config: no publish, no restore, no raw html, no seo, talent preview", () => {
  const c = buildThemeTemplateBuilderConfig(themeAdapter);
  assert.equal(c.permissions.canPublish, false);
  assert.equal(c.permissions.canRestoreRevision, false);
  assert.equal(c.permissions.canInsertRawHtmlElements, false);
  assert.equal(c.permissions.canEditShell, false);
  assert.equal(c.capabilities.seo, false);
  assert.equal(c.previewSubjectKind, "talent");
});

test("theme_template gallery + capabilities equal the TALENT page config (minus publish/restore/seo), not platform_lab", () => {
  const theme = buildThemeTemplateBuilderConfig(themeAdapter);
  const talent = buildTalentPageBuilderConfig(adapterOf("talent_page"));
  const lab = buildPlatformLabBuilderConfig(adapterOf("platform_lab"), "talent");

  assert.deepEqual(theme.galleryPolicy, talent.galleryPolicy);
  const { seo: _seoTheme, ...themeCaps } = theme.capabilities;
  const { seo: _seoTalent, ...talentCaps } = talent.capabilities;
  assert.deepEqual(themeCaps, talentCaps);
  assert.equal(theme.previewSubjectKind, talent.previewSubjectKind);

  // Nothing agency-Studio leaks in.
  assert.notEqual(theme.galleryPolicy.isLab, true);
  assert.equal(lab.galleryPolicy.isLab, true);
  assert.ok(!theme.galleryPolicy.allowedTabs.includes("shell"));
  assert.notDeepEqual(theme.galleryPolicy, lab.galleryPolicy);
});

test("theme_template adapter: load carries rev as pageVersion; save sends expectedRev; publish refuses", async () => {
  const saves: Array<{ expectedRev: number; tree: string }> = [];
  const a = createThemeTemplateAdapter("folio", "shell", {
    loadTree: async () => ({ ok: true, value: { design: "folio", tree: [], rev: 7 } }),
    saveTree: async (i) => {
      saves.push({ expectedRev: i.expectedRev, tree: i.tree });
      return { ok: true, rev: i.expectedRev + 1 };
    },
  });
  const ctx = { locale: "en" };
  const loaded = await a.load(ctx);
  assert.ok(loaded.ok);
  if (loaded.ok) assert.equal(loaded.data.pageVersion, 7);
  const saved = await a.saveDraft(ctx, {
    expectedVersion: 7,
    metadata: {} as never,
    slots: {},
    builderTree: [],
  });
  assert.ok(saved.ok);
  if (saved.ok) assert.equal(saved.pageVersion, 8);
  assert.deepEqual(saves, [{ expectedRev: 7, tree: "shell" }]);
  const pub = await a.publish(ctx, { expectedVersion: 8 });
  assert.equal(pub.ok, false);
});
