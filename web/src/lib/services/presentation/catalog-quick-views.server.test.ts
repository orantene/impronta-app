import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildCatalogQuickViewsByNode } from "./catalog-quick-views.server";
import type { ServicePresentationSource } from "./catalog-presentation";
import type { TalentOffering } from "@/lib/talent/offerings-types";

function offering(id8: string, title: string, extra: Partial<TalentOffering> = {}): TalentOffering {
  return {
    id: `${id8}-0000-4000-8000-000000000000`,
    kind: "service",
    title,
    description: null,
    priceDisplay: "exact",
    priceType: "fixed",
    amountCents: 30000,
    currency: "MXN",
    durationMinutes: 60,
    visibility: "public",
    imageUrls: [],
    status: "published",
    moderationState: "approved",
    category: "Clases",
    sortOrder: 0,
    ...extra,
  } as unknown as TalentOffering;
}

const A = offering("aaaaaaaa", "Clase de salsa");
const B = offering("bbbbbbbb", "Clase privada");
const FREE: ServicePresentationSource = { tradeSlug: "dancer", allowedModes: ["quick_view", "expand", "book_direct"] };
const PAID: ServicePresentationSource = { tradeSlug: "dancer", allowedModes: ["own_page", "quick_view", "expand", "book_direct"] };

const tree = (props: Record<string, unknown>, id = "n1") => [
  { id: "root", kind: "section", props: {}, children: [{ id, kind: "services_catalog", props }] },
];

describe("buildCatalogQuickViewsByNode (server-side, keeps the admin bundle lean)", () => {
  it("no presentation data (flag off) or no link base (draft, builder): nothing", () => {
    assert.deepEqual(buildCatalogQuickViewsByNode({ blocks: tree({}), offerings: [A], source: undefined, linkBase: "", locale: "es" }), {});
    assert.deepEqual(buildCatalogQuickViewsByNode({ blocks: tree({}), offerings: [A], source: FREE, linkBase: null, locale: "es" }), {});
  });

  it("one entry per services widget, keyed by node id, with hrefs, targets and quick views", () => {
    const out = buildCatalogQuickViewsByNode({ blocks: tree({}), offerings: [A, B], source: FREE, linkBase: "", locale: "es" });
    assert.deepEqual(Object.keys(out), ["n1"]);
    assert.equal(out.n1!.hrefs[A.id], "#servicio-aaaaaaaa");
    assert.deepEqual(out.n1!.views.map((v) => v.domId), ["servicio-aaaaaaaa--n1", "servicio-bbbbbbbb--n1"]);
  });

  it("reads the widget's tapAction ('Al tocar') from the node props", () => {
    const out = buildCatalogQuickViewsByNode({ blocks: tree({ tapAction: "quick_view" }), offerings: [A], source: PAID, linkBase: "", locale: "es" });
    assert.equal(out.n1!.targets[A.id]!.opens, "quick_view");
    const page = buildCatalogQuickViewsByNode({ blocks: tree({}), offerings: [A], source: PAID, linkBase: "", locale: "es" });
    assert.equal(page.n1!.targets[A.id]!.opens, "page");
  });

  it("respects the widget's own selection (only the services it shows get dialogs)", () => {
    const out = buildCatalogQuickViewsByNode({
      blocks: tree({ selectionMode: "ids", selectedOfferingIds: [B.id] }),
      offerings: [A, B],
      source: FREE,
      linkBase: "",
      locale: "es",
    });
    assert.deepEqual(Object.keys(out.n1!.hrefs), [B.id]);
  });

  it("finds widgets nested anywhere in the tree", () => {
    const blocks = [{ id: "a", kind: "section", props: {}, children: [{ id: "b", kind: "columns", props: {}, children: [{ id: "deep", kind: "services_catalog", props: {} }] }] }];
    assert.deepEqual(Object.keys(buildCatalogQuickViewsByNode({ blocks, offerings: [A], source: FREE, linkBase: "", locale: "es" })), ["deep"]);
  });
});

describe("bundle wiring (static)", () => {
  const render = readFileSync(join(process.cwd(), "src/lib/site-admin/builder-node/render.tsx"), "utf8");
  it("render.tsx (also in the admin client graph, at its bundle ceiling) imports nothing for quick views", () => {
    assert.doesNotMatch(render, /from "@\/lib\/services\/presentation\//);
    assert.doesNotMatch(render, /@\/components\/services\/quick-view\//);
    assert.doesNotMatch(render, /next\/dynamic/);
    assert.match(render, /options\.dataSources\.serviceQuickViews\?\.\[node\.id\]/);
    assert.match(render, /\{quickViews\?\.layer \?\? null\}/);
  });
  it("the published talent site builds the hrefs and the dialog layer server-side", () => {
    const doc = readFileSync(join(process.cwd(), "src/lib/talent-site/server/render-max-site-document.tsx"), "utf8");
    assert.match(doc, /buildCatalogQuickViewsByNode\(\{/);
    assert.match(doc, /<ServiceQuickViewLayer/);
  });
});
