import test from "node:test";
import assert from "node:assert/strict";

import { previewSwitchSummary } from "./design-switch-preview";

test("no site record: empty summary, preview compute never called", async () => {
  let previewed = 0;
  const r = await previewSwitchSummary({
    findSiteId: async () => null,
    preview: async () => {
      previewed++;
      return { ok: true, warned: [] };
    },
    locale: "en",
  });
  assert.deepEqual(r, { ok: true, data: { hidden: [], kept: [] } });
  assert.equal(previewed, 0);
});

test("existing site: summarizes warnings; deps expose no provisioning path", async () => {
  const r = await previewSwitchSummary({
    findSiteId: async () => "s1",
    preview: async (id) => {
      assert.equal(id, "s1");
      return { ok: true, warned: [{ tree: "home", key: "home/gallery", kind: "section", reason: "no_match" }] };
    },
    locale: "en",
  });
  assert.deepEqual(r, { ok: true, data: { hidden: ["Gallery"], kept: [] } });
});

test("theme-actions preview action never references provisioning", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("./theme-actions.ts", import.meta.url), "utf8");
  const body = src.slice(
    src.indexOf("export async function previewSiteDesignSwitchAction"),
    src.indexOf("/** Apply a Look"),
  );
  assert.doesNotMatch(body, /ensureSiteId|provisionTalentMaxSite/);
});
