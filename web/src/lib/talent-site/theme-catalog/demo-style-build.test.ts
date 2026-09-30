/**
 * Maison v2 demos re-apply the whole design on every release, then wear their
 * own style. A design-level layout change must not flatten the demos' approved
 * menus into one look.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { buildDesignTrees, fallbackHydrationTokens } from "../server/theme-apply-core";
import { buildMaisonV2Payload } from "./collection/designs";
import { styleTrees } from "./demo-style-build";
import { MAISON_V2_DEMO_STYLES } from "./theme-demos";

const media = { card: "https://example.test/card.jpg", hero: null, gallery: Array.from({ length: 12 }, (_, i) => `https://example.test/g${i}.jpg`) };

function catalogs(nodes: ReadonlyArray<BuilderNode>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const walk = (list: ReadonlyArray<BuilderNode>) => {
    for (const n of list) {
      if (n.kind === "services_catalog") out.push(n.props as Record<string, unknown>);
      walk(((n as { children?: BuilderNode[] }).children ?? []) as BuilderNode[]);
    }
  };
  walk(nodes);
  return out;
}

for (const [code, style] of Object.entries(MAISON_V2_DEMO_STYLES)) {
  test(`demo ${code}: the styled menu keeps its rows layout and its own columns`, () => {
    const built = buildDesignTrees(buildMaisonV2Payload(), { ...fallbackHydrationTokens("Demo"), bio: "Bio", tagline: "Tag" }, 2026, {
      design: "maison-v2",
      version: 1,
    });
    assert.ok(built.ok);
    if (!built.ok) return;
    const styled = styleTrees(built, style, media, code);
    const found = catalogs(styled.homeTree);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.layout, "rows", "the design's two-column cards layout is opt-in for talents only");
    assert.equal(found[0]!.columns, style.menu.columns);
    assert.equal(found[0]!.categoryNav, style.menu.categoryNav);
  });
}
