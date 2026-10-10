/**
 * TUL-559 — talent reaches the design gallery from Mi sitio in ≤2 clicks
 * (live card + pre-publish + Sitio web → Diseño hub).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "src");

test("live MyWebsiteCard keeps maison-change-design", () => {
  const card = readFileSync(join(root, "components/talent/site/maison-setup/MyWebsiteCard.tsx"), "utf8");
  assert.match(card, /data-testid="maison-change-design"/);
  assert.match(card, /onChangeDesign/);
});

test("pre-publish Mi sitio exposes maison-change-design (TUL-559)", () => {
  const mgr = readFileSync(join(root, "components/talent/site/TalentMaxSiteManager.tsx"), "utf8");
  assert.match(mgr, /data-testid="maison-change-design"/);
  assert.match(mgr, /openSetup\("gallery"\)/);
  assert.match(mgr, /Cambiar diseño/);
});

test("WebsiteDesignHub talent path opens /talent/site gallery (TUL-559)", () => {
  const hub = readFileSync(
    join(root, "components/admin/shell/internal/page-modules/WebsiteDesignHub.tsx"),
    "utf8",
  );
  assert.match(hub, /data-testid="talent-change-design-hub"/);
  assert.match(hub, /requestWebsiteSetup\("gallery"\)/);
  assert.match(hub, /href="\/talent\/site"/);
  assert.match(hub, /workspaceType === "talent"/);
});
