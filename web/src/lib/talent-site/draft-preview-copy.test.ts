import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { draftPreviewBannerText } from "./draft-preview-copy";

test("F75: draft preview banner has no em dash in EN or ES", () => {
  for (const l of ["en", "es", "es-MX", null, undefined]) {
    const t = draftPreviewBannerText(l);
    assert.ok(!t.includes("\u2014") && !t.includes("\u2013"), String(l));
  }
  assert.match(draftPreviewBannerText("es-MX"), /^Vista previa del borrador/);
  assert.match(draftPreviewBannerText("en"), /^Draft preview\./);
});

test("F75: both renderers use the shared copy, not a literal", () => {
  for (const f of ["server/render-max-site.tsx", "../../components/talent/site/PlatformTalentMaxSiteView.tsx"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(src.includes("draftPreviewBannerText("), f);
    assert.ok(!/Draft preview\s*\u2014/.test(src), f);
  }
});
