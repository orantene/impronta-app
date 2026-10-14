/**
 * TUL-516 C1: Gridline "Recent jobs" gallery heading is Spanish on es pages.
 * Theme core only — seed overlay + render-time map share RECENT_JOBS_LABEL.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { localizeBlockNode } from "@/lib/site-admin/builder-node/block-i18n";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { localiseSeededDesignLabels } from "@/lib/talent-site/design-label-locale";
import { RECENT_JOBS_LABEL } from "../seed-i18n";
import { buildGridlinePayload } from "./gridline";

type Node = { kind: string; props?: Record<string, unknown>; children?: Node[] };

function walk(nodes: Node[] | undefined, visit: (n: Node) => void): void {
  for (const n of nodes ?? []) {
    visit(n);
    walk(n.children, visit);
  }
}

function findPortfolio(home: Node[]): Node {
  let hit: Node | undefined;
  walk(home, (n) => {
    if (!hit && n.kind === "portfolio") hit = n;
  });
  assert.ok(hit, "Gridline homeTree has a portfolio");
  return hit!;
}

test("TUL-516 C1: Gridline seed ships Recent jobs with es+en overlays", () => {
  const portfolio = findPortfolio(buildGridlinePayload().homeTree as Node[]);
  assert.equal(portfolio.props?.title, RECENT_JOBS_LABEL.en);
  const i18n = portfolio.props?.i18n as { es?: { title?: string }; en?: { title?: string } };
  assert.equal(i18n?.es?.title, RECENT_JOBS_LABEL.es);
  assert.equal(i18n?.en?.title, RECENT_JOBS_LABEL.en);
});

test("TUL-516 C1: legacy English title (no overlay) localises on es pages", () => {
  const legacy = [
    {
      id: "p",
      kind: "portfolio",
      props: { layout: "work_order", title: RECENT_JOBS_LABEL.en, limit: 6 },
    },
  ] as unknown as BuilderNode[];
  const es = localiseSeededDesignLabels(legacy, "es-MX");
  assert.equal((es[0]!.props as { title: string }).title, RECENT_JOBS_LABEL.es);
  assert.equal(localiseSeededDesignLabels(legacy, "en"), legacy);
});

test("TUL-516 C1: seeded Gridline portfolio renders Trabajos recientes for es visitor", () => {
  const portfolio = findPortfolio(buildGridlinePayload().homeTree as Node[]) as BuilderNode;
  const localized = localizeBlockNode(portfolio, {
    locale: "es",
    defaultLocale: "es",
    chain: ["en"],
  });
  assert.equal((localized.props as { title: string }).title, RECENT_JOBS_LABEL.es);
  const html = renderToStaticMarkup(
    renderBuilderNodes([localized], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources: {},
      contentLocale: { locale: "es", defaultLocale: "es", chain: ["en"] },
      visitorLocale: "es",
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
  assert.match(html, /Trabajos recientes/);
  assert.doesNotMatch(html, /Recent jobs/);
});
