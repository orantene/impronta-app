/**
 * TUL-516 C2: Gridline "No emergencies today" status pill is Spanish on es pages.
 * Theme core only — seed overlay + render-time map share NO_EMERGENCIES_TODAY_LABEL.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { localizeBlockNode } from "@/lib/site-admin/builder-node/block-i18n";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { localiseSeededDesignLabels } from "@/lib/talent-site/design-label-locale";
import {
  EMERGENCIES_TODAY_LABEL,
  NO_EMERGENCIES_TODAY_LABEL,
} from "../seed-i18n";
import { buildGridlinePayload } from "./gridline";

type Node = { kind: string; props?: Record<string, unknown>; children?: Node[] };

function walk(nodes: Node[] | undefined, visit: (n: Node) => void): void {
  for (const n of nodes ?? []) {
    visit(n);
    walk(n.children, visit);
  }
}

function findUtilityBar(shell: Node[]): Node {
  let hit: Node | undefined;
  walk(shell, (n) => {
    if (!hit && n.kind === "utility_bar") hit = n;
  });
  assert.ok(hit, "Gridline shellTree has a utility_bar");
  return hit!;
}

test("TUL-516 C2: Gridline seed ships status pill labels with es+en overlays", () => {
  const bar = findUtilityBar(buildGridlinePayload().shellTree as Node[]);
  assert.equal(bar.props?.statusOnLabel, EMERGENCIES_TODAY_LABEL.en);
  assert.equal(bar.props?.statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.en);
  const i18n = bar.props?.i18n as {
    es?: { statusOnLabel?: string; statusOffLabel?: string };
    en?: { statusOnLabel?: string; statusOffLabel?: string };
  };
  assert.equal(i18n?.es?.statusOnLabel, EMERGENCIES_TODAY_LABEL.es);
  assert.equal(i18n?.es?.statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.es);
  assert.equal(i18n?.en?.statusOnLabel, EMERGENCIES_TODAY_LABEL.en);
  assert.equal(i18n?.en?.statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.en);
});

test("TUL-516 C2: legacy English statusOff (no overlay) localises on es pages", () => {
  const legacy = [
    {
      id: "u",
      kind: "utility_bar",
      props: {
        name: "Saul",
        showStatus: true,
        statusOffLabel: NO_EMERGENCIES_TODAY_LABEL.en,
      },
    },
  ] as unknown as BuilderNode[];
  const es = localiseSeededDesignLabels(legacy, "es-MX");
  assert.equal((es[0]!.props as { statusOffLabel: string }).statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.es);
  const en = localiseSeededDesignLabels(legacy, "en");
  assert.equal((en[0]!.props as { statusOffLabel: string }).statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.en);
  assert.equal((en[0]!.props as { statusOnLabel: string }).statusOnLabel, EMERGENCIES_TODAY_LABEL.en);
});

test("TUL-516 C2: missing statusOffLabel (saul-shaped) fills Spanish on es pages", () => {
  const bare = [
    {
      id: "u",
      kind: "utility_bar",
      props: { name: "Saul", showStatus: true },
    },
  ] as unknown as BuilderNode[];
  const es = localiseSeededDesignLabels(bare, "es");
  assert.equal((es[0]!.props as { statusOffLabel: string }).statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.es);
  assert.equal((es[0]!.props as { statusOnLabel: string }).statusOnLabel, EMERGENCIES_TODAY_LABEL.es);
  const en = localiseSeededDesignLabels(bare, "en");
  assert.equal((en[0]!.props as { statusOffLabel: string }).statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.en);
});

test("TUL-516 C2: seeded Gridline utility bar renders Sin urgencias hoy for es visitor", () => {
  const bar = findUtilityBar(buildGridlinePayload().shellTree as Node[]) as BuilderNode;
  const localized = localizeBlockNode(bar, {
    locale: "es",
    defaultLocale: "es",
    chain: ["en"],
  });
  assert.equal((localized.props as { statusOffLabel: string }).statusOffLabel, NO_EMERGENCIES_TODAY_LABEL.es);
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
  assert.match(html, /Sin urgencias hoy/);
  assert.doesNotMatch(html, /No emergencies today/);
});
