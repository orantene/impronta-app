import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { FactoryOverview } from "./factory-model";
import { TalentFactoryTab } from "./talent-factory-tab";

const row = (slug: string, title: string, over: Partial<FactoryOverview["rows"][number]> = {}) => ({
  slug,
  title,
  catalogVersion: 2,
  codeVersion: 2,
  status: "up_to_date" as const,
  demoCount: 3,
  galleryVisible: true,
  latestReleaseId: "11111111-1111-1111-1111-111111111111",
  previewHref: `/template-preview/${slug}?kind=talent-theme&source=code`,
  mockupPath: `web/design-references/${slug}`,
  parityMapPresent: true,
  canRebuild: true,
  referenceDemoCode: "TAL-93020",
  mockupRun: null,
  ...over,
});

const DATA: FactoryOverview = {
  mockupMode: "local",
  rows: [
    row("maison-v2", "Maison v2", { status: "code_ahead", codeVersion: 3 }),
    row("folio", "Folio", {
      mockupRun: { timestamp: "2026-09-30T10:00:00Z", pass: 4, fail: 0, known: 1, openDeltas: 2, deltasByLayer: { token: 1, payload: 1, kit: 0, platform: 0, "new-capability": 0 }, reportPath: "web/qa-evidence/mockup-parity/x/report.html" },
    }),
    row("solace", "Solace", { demoCount: 0, canRebuild: false, galleryVisible: false, catalogVersion: null, status: "not_synced", latestReleaseId: null, referenceDemoCode: null }),
  ],
};

describe("TalentFactoryTab render", () => {
  const html = renderToStaticMarkup(<TalentFactoryTab initial={DATA} onOpenBuilder={() => {}} />);
  it("renders one card per talent design with status, versions and links", () => {
    for (const s of ["maison-v2", "folio", "solace"]) assert.match(html, new RegExp(`data-factory-design="${s}"`));
    assert.match(html, /Code is ahead \(sync needed\)/);
    assert.match(html, /Up to date/);
    assert.match(html, /Not synced yet/);
    assert.match(html, /source=code/);
    assert.match(html, /\/platform\/admin\/builder-lab\/themes\/11111111/);
    assert.match(html, /web\/design-references\/folio/);
  });
  it("shows the mockup comparison, the cli command and the checklist", () => {
    assert.match(html, /token 1, payload 1/);
    assert.match(html, /npm run qa:mockup-parity -- --design folio/);
    assert.match(html, /data-how-to-add/);
    assert.match(html, /Publish and update demos/);
    assert.match(html, /theme:pull-authored/);
    assert.match(html, /how-to-make-a-new-theme\.md/);
    assert.doesNotMatch(html, /COLLECTION_DESIGNS/);
  });
  it("lists no agency starters and states the open-in-builder limits", () => {
    assert.doesNotMatch(html, /builtin-|Site Starter Kit|Sync built-in starters/);
    assert.match(html, /Edit design in builder/);
    assert.match(html, /never touch a talent site/);
  });
  it("renders Spanish", () => {
    const es = renderToStaticMarkup(<TalentFactoryTab locale="es" initial={DATA} onOpenBuilder={() => {}} />);
    assert.match(es, /Fábrica de plantillas de talento/);
    assert.match(es, /Editar diseño en el editor/);
    assert.match(es, /Publica y actualiza las demos/);
    assert.doesNotMatch(es, /—/);
  });
  it("production mode shows only the local hint", () => {
    const p = renderToStaticMarkup(<TalentFactoryTab initial={{ ...DATA, mockupMode: "production" }} />);
    assert.match(p, /Run this on your machine/);
    assert.doesNotMatch(p, /Open deltas/);
  });
});
