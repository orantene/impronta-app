import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildThemeTemplateBuilderConfig } from "./config";
import { createThemeTemplateAdapter } from "./adapters/theme-template-adapter-core";

test("theme_template config hides the builder Publish; topbar gates it on surfaceKind", () => {
  const c = buildThemeTemplateBuilderConfig(
    createThemeTemplateAdapter("folio", "home", {
      loadTree: async () => ({ ok: false, error: "x" }),
      saveTree: async () => ({ ok: false, error: "x" }),
    }),
  );
  assert.equal(c.permissions.canPublish, false);
  const src = readFileSync("src/components/edit-chrome/topbar.tsx", "utf8");
  assert.match(src, /surfaceKind === "theme_template" \? null : \(\s*<PublishSplitButton/);
});
