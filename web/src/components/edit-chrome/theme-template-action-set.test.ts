import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createThemeTemplateActionSet } from "./theme-template-action-set";
import { resetDraftRevAdoptions } from "@/lib/talent-site/history/draft-rev";
import { themeTemplateCanvasTokens } from "@/lib/talent-site/theme-template/theme-template-tokens";

test("theme_template branch precedes the tenant fallthrough and never uses tenant actions", () => {
  const src = readFileSync(new URL("./theme-action-scope.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export function resolveThemeActionSet"));
  const tpl = fn.indexOf('surfaceKind === "theme_template"');
  const tenant = fn.indexOf("loadDesignAction()");
  assert.ok(tpl > -1 && tenant > tpl);
  const block = fn.slice(tpl, fn.indexOf('surfaceKind === "talent_page"'));
  assert.ok(block.includes("if (!pageSlug) return null"));
  assert.ok(!block.includes("loadDesignAction"));
  assert.ok(!block.includes("agency"));
});

test("round-trips a token patch through a fake store and adopts the rev", async () => {
  resetDraftRevAdoptions();
  const store = { rev: 3, tokens: {} as Record<string, string> };
  const set = createThemeTemplateActionSet("folio", {
    load: async () => ({ ok: false, error: "n/a" }),
    save: async ({ patch, expectedRev }) => {
      if (expectedRev !== store.rev) return { ok: false, error: "stale", code: "CONFLICT" };
      Object.assign(store.tokens, patch);
      store.rev += 1;
      return { ok: true, version: store.rev, themeDraft: patch, draftRev: store.rev };
    },
  });
  const a = await set.saveDraft({ patch: { "color.primary": "navy" }, expectedVersion: 3 });
  assert.equal(a.ok, true);
  // The stale editor version 3 is translated through the adoption chain.
  const b = await set.saveDraft({ patch: { "color.ink": "black" }, expectedVersion: 3 });
  assert.equal(b.ok, true);
  assert.equal(store.rev, 5);
  assert.equal(store.tokens["color.ink"], "black");
});

test("presets, component styles and publish are unsupported (EN+ES)", async () => {
  const set = createThemeTemplateActionSet("folio", {
    load: async () => ({ ok: false, error: "n/a" }),
    save: async () => ({ ok: false, error: "n/a" }),
  });
  for (const r of [
    await set.applyPreset({ presetSlug: "p", expectedVersion: 1 }),
    await set.saveComponentStyles({ componentStyles: {}, expectedVersion: 1 }),
    await set.publish({ expectedVersion: 1 }),
  ]) {
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "unsupported");
      assert.match(r.error, /Not available/);
      assert.match(r.error, /No disponible/);
    }
  }
});

test("canvas tokens: design tokenDefaults reach the canvas; look keeps its colours", () => {
  const t = themeTemplateCanvasTokens(
    { design: "x", preview: {}, payload: { tokenDefaults: { "radius.base": "20px" } } as never },
    { "color.ink": "rgb(4, 5, 6)" },
  );
  assert.equal(t["radius.base"], "20px");
  assert.equal(t["color.ink"], "rgb(4, 5, 6)");
});
