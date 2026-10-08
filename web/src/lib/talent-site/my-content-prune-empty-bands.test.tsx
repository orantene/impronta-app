/**
 * TUL-118 (DS-64, E-12): a freshly published talent site must not show visitors
 * the owner-facing empty states. The live prune drops an empty services band, an
 * empty gallery band and an empty FAQ band (with its "Ask a question" button);
 * the builder canvas renders the raw tree and keeps them.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { TalentPortfolioShot } from "@/lib/site-admin/builder-node/portfolio-types";
import { buildMaisonDesignPayload } from "./theme-catalog/maison/design-payload";
import { SEED_TEXT_ES } from "./theme-catalog/seed-i18n";
import { pruneEmptyBoundSections } from "./my-content-prune";

const homeTree = () => buildMaisonDesignPayload().homeTree;

function find(nodes: readonly BuilderNode[], pred: (n: BuilderNode) => boolean, out: BuilderNode[] = []): BuilderNode[] {
  for (const n of nodes) {
    if (pred(n)) out.push(n);
    const kids = (n as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) find(kids, pred, out);
  }
  return out;
}
const kindCount = (tree: readonly BuilderNode[], kind: string) => find(tree, (n) => n.kind === kind).length;
const bandCount = (tree: readonly BuilderNode[]) =>
  find(tree, (n) => typeof (n.props as { slotKey?: unknown }).slotKey === "string").length;

const offering = { id: "o1", status: "published", visibility: "public", moderationState: "approved", kind: "service", title: "Gel" } as unknown as TalentOffering;
const shot: TalentPortfolioShot = { id: "s1", url: "https://example.test/s1.jpg", alt: "Work", caption: null, offeringId: null, offeringTitle: null, albumId: null };
const ds = (x: Record<string, unknown>) => x as BuilderNodeRenderDataSources;
const empty = ds({ talentOfferings: [], talentPortfolioShots: [], talentFaqItems: [] });

function html(tree: BuilderNode[], dataSources: BuilderNodeRenderDataSources, editorPreview = false): string {
  return renderToStaticMarkup(
    renderBuilderNodes(tree, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
      ...(editorPreview ? { contentLocale: { locale: "en", defaultLocale: "en", chain: ["en"], editorPreview: true } } : {}),
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

test("published + empty: services, gallery and FAQ bands are all gone", () => {
  const tree = homeTree();
  const bandsBefore = bandCount(tree);
  const out = pruneEmptyBoundSections(tree, empty);
  assert.equal(kindCount(out, "services_catalog"), 0);
  assert.equal(kindCount(out, "portfolio"), 0);
  assert.equal(kindCount(out, "accordion"), 0);
  // The Questions heading and the ask button went with the FAQ band.
  const ask = (t: readonly BuilderNode[]) =>
    find(t, (n) => n.kind === "button" && (n.props as { href?: string }).href === "#talent-ask").length;
  assert.equal(ask(out), ask(tree) - 1);
  assert.equal(bandCount(out), bandsBefore - 3);
  // Real content (hero, about) stays.
  assert.ok(kindCount(out, "heading") > 0);
  // Empty bands pruned before render; English empty-state copy must not appear either.
  const markup = html(out, empty);
  assert.doesNotMatch(markup, /Servicios|No photos|Aún no hay|Preguntas|No services are published/);
});

test("builder canvas keeps the empty states (raw tree, editorPreview)", () => {
  const markup = html(homeTree(), empty, true);
  assert.match(markup, /No photos in your portfolio yet\./);
  assert.match(markup, /No services are published yet\./);
});

test("published + data: each band renders", () => {
  const withData = ds({
    talentOfferings: [offering],
    talentPortfolioShots: [shot],
    talentFaqItems: [{ id: "q1", question: "Do you do gel?", answer: "Yes." }],
  });
  const tree = homeTree();
  const out = pruneEmptyBoundSections(tree, withData);
  assert.equal(kindCount(out, "services_catalog"), 1);
  assert.equal(kindCount(out, "portfolio"), 1);
  assert.equal(kindCount(out, "accordion"), 1);
  assert.equal(bandCount(out), bandCount(tree));
});

test("one empty block does not hide a band that holds other real content", () => {
  const band = {
    id: "b",
    kind: "container",
    props: { slotKey: "gallery", originRole: "talent.gallery" },
    children: [
      { id: "i", kind: "image", props: { src: "https://example.test/a.jpg", alt: "a" } },
      { id: "p", kind: "portfolio", props: { selectionMode: "all", autoIncludeNew: true } },
    ],
  } as unknown as BuilderNode;
  const out = pruneEmptyBoundSections([band], empty);
  assert.equal(kindCount(out, "image"), 1);
  assert.equal(kindCount(out, "portfolio"), 0);
});

test("a data source that was never loaded keeps the block (conservative)", () => {
  const out = pruneEmptyBoundSections(homeTree(), ds({}));
  assert.equal(kindCount(out, "services_catalog"), 1);
  assert.equal(kindCount(out, "portfolio"), 1);
});

test("E-12: the portfolio empty message carries a Spanish seed overlay (TUL-369)", () => {
  const p = find(homeTree(), (n) => n.kind === "portfolio")[0]!;
  const props = p.props as {
    emptyMessage?: string;
    i18n?: { es?: { emptyMessage?: string } };
  };
  assert.equal(props.emptyMessage, "No photos in your portfolio yet.");
  assert.equal(props.i18n?.es?.emptyMessage, "Aún no hay fotos en tu portafolio.");
  assert.equal(SEED_TEXT_ES["No photos in your portfolio yet."], "Aún no hay fotos en tu portafolio.");
});
