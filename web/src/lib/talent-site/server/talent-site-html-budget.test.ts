/**
 * TUL-446 — Maison fixture public HTML payload budget.
 *
 * Live book-jorgelina was 1.74 MB raw mostly from RSC flight `"$undefined"`
 * style attrs + unused type-system / freeform breakpoint sheets. This test
 * estimates the public Max-site document payload for the Maison seed (no
 * per-talent data) and fails above 600 KB.
 *
 * Estimate = static markup
 *          + scoped renderer CSS
 *          + active type-system sheets
 *          + section-only custom breakpoint CSS
 *          + JSON of style attrs for every node (flight stand-in)
 *          + representative slim offerings JSON
 *
 * It does not run Next, so it cannot count real `__next_f` framing — the
 * style-attr JSON is the dominant flight term we control, and the CSS terms
 * match what render-max-site ships.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BUILDER_NODE_RENDERER_CSS,
  builderNodeStyleAttrs,
  buildScopedRendererCss,
  collectPresentNodeKinds,
  renderBuilderNodes,
} from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  BUILTIN_EXTRA_TIERS,
  generateCustomBreakpointCss,
  treeHasCustomBreakpointStyles,
} from "@/lib/site-admin/builder-node/custom-breakpoint-css";
import { buildMaisonV2Payload } from "@/lib/talent-site/theme-catalog/collection/maison-v2";
import {
  typeSystemSheetsForTokens,
} from "@/lib/talent-site/theme-catalog/collection/design-type-system-style";
import { EDITORIAL_TYPE_SYSTEM_CSS, MAGAZINE_TYPE_SYSTEM_CSS } from "@/lib/talent-site/theme-catalog/collection/design-type-system";
import { HIGHLIGHT_ACCENT_CSS, UTILITY_TYPE_SYSTEM_CSS } from "@/lib/talent-site/theme-catalog/collection/design-type-system-utility";
import { UTILITY_BOOKING_CSS } from "@/lib/talent-site/theme-catalog/collection/design-type-system-utility-booking";
import { MOTION_CSS } from "@/lib/talent-site/theme-catalog/collection/motion-css";

const BUDGET_BYTES = 600 * 1024;

const SHEET_CSS: Record<string, string> = {
  editorial: EDITORIAL_TYPE_SYSTEM_CSS,
  magazine: MAGAZINE_TYPE_SYSTEM_CSS,
  utility: UTILITY_TYPE_SYSTEM_CSS,
  "utility-booking": UTILITY_BOOKING_CSS,
  highlight: HIGHLIGHT_ACCENT_CSS,
  motion: MOTION_CSS.join("\n"),
};

function walkNodes(nodes: ReadonlyArray<BuilderNode>, visit: (n: BuilderNode) => void) {
  for (const node of nodes) {
    visit(node);
    if ("children" in node && Array.isArray(node.children)) {
      walkNodes(node.children as BuilderNode[], visit);
    }
  }
}

function styleOf(node: BuilderNode) {
  if (!("props" in node) || !node.props || typeof node.props !== "object") return undefined;
  return (node.props as { style?: Parameters<typeof builderNodeStyleAttrs>[0] }).style;
}

/** Representative lean public offerings (post stripPublicOfferingFlightFields). */
function fixtureOfferingsJson(count: number): string {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `off-${i}`,
    talentProfileId: "talent",
    ownerKind: "talent",
    tenantId: null,
    kind: "service",
    title: `Service ${i}`,
    description: "A short public description.",
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 30000 + i * 100,
    currency: "MXN",
    bookingMode: "instant",
    reserveMode: "free",
    depositPct: null,
    allowPayInPerson: true,
    requireAccountToBook: false,
    requiresIdentity: false,
    identityReason: null,
    cancellationHours: 24,
    freeReserveExpiresDays: null,
    durationMinutes: 90,
    category: "Nails",
    inventoryQty: null,
    capacityPoolId: null,
    consumesUnits: 1,
    isFeatured: i === 0,
    attributes: {},
    imageUrls: [`https://cdn.example/img-${i}.jpg`],
    variants: [],
    addOns: [],
  }));
  return JSON.stringify(rows);
}

test("Maison fixture estimated public HTML stays under 600 KB", () => {
  const payload = buildMaisonV2Payload();
  const trees = [payload.shellTree, payload.homeTree].filter(Boolean) as BuilderNode[][];
  const allNodes = trees.flat();
  const kinds = collectPresentNodeKinds(allNodes);
  const scopedCss = buildScopedRendererCss(BUILDER_NODE_RENDERER_CSS, kinds);
  const typeSheets = typeSystemSheetsForTokens(payload.tokenDefaults);
  const typeCss = typeSheets.map((id) => SHEET_CSS[id] ?? "").join("");
  // Public root: section presentation only (no freeform unless the tree uses it).
  const bpCss = treeHasCustomBreakpointStyles(allNodes)
    ? generateCustomBreakpointCss(BUILTIN_EXTRA_TIERS, { includeFreeform: true })
    : generateCustomBreakpointCss(BUILTIN_EXTRA_TIERS, { includeFreeform: false });

  let attrsJsonBytes = 0;
  let nodeCount = 0;
  let undefinedAttrKeys = 0;
  walkNodes(allNodes, (node) => {
    nodeCount += 1;
    const attrs = builderNodeStyleAttrs(styleOf(node));
    for (const v of Object.values(attrs)) {
      if (v === undefined) undefinedAttrKeys += 1;
    }
    attrsJsonBytes += JSON.stringify(attrs).length;
  });

  const markup = renderToStaticMarkup(
    renderBuilderNodes(payload.homeTree, {
      mode: "freeform",
      includeRendererStyles: false,
      publicPathPrefix: "",
    }),
  );

  const offeringsJson = fixtureOfferingsJson(22);
  // Flight roughly doubles CSS that appears as <style> children (SSR + RSC).
  const cssOnce = scopedCss.length + typeCss.length + bpCss.length;
  const estimated =
    markup.length +
    cssOnce * 2 +
    attrsJsonBytes * 2 + // attrs appear in SSR data-* and again in flight props
    offeringsJson.length;

  assert.equal(undefinedAttrKeys, 0, "style attrs must omit undefined keys");
  assert.ok(
    estimated <= BUDGET_BYTES,
    `Maison fixture estimate ${estimated} bytes exceeds ${BUDGET_BYTES} (nodes=${nodeCount}, markup=${markup.length}, css=${cssOnce}, attrs=${attrsJsonBytes}, offerings=${offeringsJson.length}, sheets=${typeSheets.join(",")})`,
  );
});

test("typeSystemSheetsForTokens keeps Maison on editorial+motion only", () => {
  const sheets = typeSystemSheetsForTokens({
    "type.system": "editorial",
    "type.accent-style": "italic",
  });
  assert.deepEqual([...sheets].sort(), ["editorial", "motion"]);
});
