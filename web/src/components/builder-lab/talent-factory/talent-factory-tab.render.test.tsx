import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { FactoryOverview } from "./factory-model";
import { TalentFactoryTab } from "./talent-factory-tab";

const row = (slug: string, title: string, over: Partial<FactoryOverview["rows"][number]> = {}) => ({
  slug,
  title,
  catalogVersion: 2,
  codeVersion: 2,
  releasedVersion: 2 as number | null,
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
    row("maison-v2", "Maison v2", {
      status: "code_ahead",
      codeVersion: 3,
      catalogVersion: 14,
      releasedVersion: 23,
    }),
    row("folio", "Folio", {
      mockupRun: { timestamp: "2026-09-30T10:00:00Z", pass: 4, fail: 0, known: 1, openDeltas: 2, deltasByLayer: { token: 1, payload: 1, kit: 0, platform: 0, "new-capability": 0 }, reportPath: "web/qa-evidence/mockup-parity/x/report.html" },
    }),
    row("folio-qa", "Folio Studio QA", { status: "authored_hidden", authored: true, editHref: "/x", galleryVisible: false }),
    row("gridline", "Gridline", { releasedVersion: null, latestReleaseId: null, catalogVersion: 5 }),
    row("pending", "Pending", { status: "authored_pending" }),
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
  it("labels catalog default vs open to talents and hints when they lag", () => {
    assert.match(html, /Catalog default/);
    assert.match(html, /Open to talents/);
    assert.match(html, /data-catalog-default="14"/);
    assert.match(html, /data-open-to-talents="23"/);
    assert.match(html, /data-version-lag/);
    assert.match(html, /Catalog default can lag until Make default/);
    assert.match(html, /Released in catalog \(v5\)/);
    assert.doesNotMatch(html, /JSON\.stringify|^\s*\{[\s\S]*"created"/m);
  });
  it("never dumps raw sync JSON in the tab source", () => {
    const src = readFileSync(new URL("./talent-factory-tab.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(src, /JSON\.stringify\(sync/);
  });
  it("groups hidden drafts in a collapsed section", () => {
    const m = html.match(/<details[^>]*data-hidden-drafts[^>]*>([\s\S]*?)<\/details>/);
    assert.ok(m, "details present");
    assert.doesNotMatch(m![0].split(">")[0], /open/);
    assert.match(m![1], /Hidden drafts \(1\)/);
    assert.match(m![1], /data-factory-design="folio-qa"/);
    assert.doesNotMatch(html.replace(m![0], ""), /data-factory-design="folio-qa"/);
  });
  it("authored_pending shows the pull command", () => {
    assert.match(html, /npm run theme:pull-authored -- --design pending/);
  });
});
