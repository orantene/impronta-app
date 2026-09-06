/**
 * A RESERVATION IS NOT A DISH — the menu board lists the PUBLIC, PRICED menu.
 *
 * Measured live on elpaisa.tulala.digital (dpl_CSqZ…, 2026-09-05 23:27Z):
 * "Tonight's selection" listed exactly one line, "Table reservation $0", with
 * a quantity stepper, because the seeded reservation offering is a published
 * workspace offering like any dish. The discriminator is the reservation's
 * real shape, visibility on_request and no price, never `kind`: the stock
 * rule in menu-board-stock.test.ts already established that a pizza can be a
 * `service` and a course a `package`.
 *
 * Split from native-data-blocks.test.ts, which sits at the max-lines cap.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import { deriveWorkspaceMenuOfferings } from "@/lib/site-admin/server/native-data-block-sources";
import type { TalentOfferingRow } from "@/lib/talent/offerings-types";
import type { BuilderNode } from "./types";

function render(nodes: BuilderNode[], dataSources: BuilderNodeRenderDataSources = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function menuRow(overrides: Partial<TalentOfferingRow> & { tenant_id: string }): TalentOfferingRow {
  return {
    id: "menu-row",
    talent_profile_id: null,
    owner_kind: "workspace",
    kind: "service",
    title: "Menu item",
    description: null,
    price_type: "flat_package",
    price_display: "exact",
    amount_cents: 2500,
    currency: "USD",
    status: "published",
    moderation_state: "approved",
    sort_order: 0,
    ...overrides,
  } as TalentOfferingRow;
}

test("A RESERVATION IS NOT A DISH: a tenant whose only offering is the seeded reservation gets an EMPTY menu", () => {
  // Measured live on elpaisa.tulala.digital (dpl_CSqZ…, 23:27Z): "Tonight's
  // selection" listed "Table reservation $0" with a quantity stepper. The
  // reservation offering is published, workspace-owned, kind service,
  // visibility on_request, amount 0. The public menu must not list it.
  const rows: TalentOfferingRow[] = [
    menuRow({
      id: "reservation",
      tenant_id: "elpaisa",
      kind: "service",
      title: "Table reservation",
      amount_cents: 0,
      price_display: "exact",
      visibility: "on_request",
    }),
  ];
  assert.deepEqual(deriveWorkspaceMenuOfferings(rows, "elpaisa"), []);
});

test("A RESERVATION IS NOT A DISH: dishes stay, the reservation and any $0 exact line go, quotes stay", () => {
  const rows: TalentOfferingRow[] = [
    menuRow({ id: "dish", tenant_id: "t", kind: "product", title: "Choripán", amount_cents: 600000, visibility: "public" }),
    menuRow({ id: "course", tenant_id: "t", kind: "package", title: "Posing course", amount_cents: 12000 }),
    menuRow({ id: "reservation", tenant_id: "t", kind: "service", title: "Table reservation", amount_cents: 0, visibility: "on_request" }),
    menuRow({ id: "free-exact", tenant_id: "t", kind: "product", title: "Mystery", amount_cents: 0, price_display: "exact" }),
    menuRow({ id: "quote", tenant_id: "t", kind: "service", title: "Catering, ask us", amount_cents: 0, price_display: "quote" }),
  ];
  assert.deepEqual(
    deriveWorkspaceMenuOfferings(rows, "t").map((d) => d.id),
    ["dish", "course", "quote"],
  );
});

test("A RESERVATION IS NOT A DISH: with nothing left the board renders its empty state, not a $0 line", () => {
  const html = render(
    [
      {
        id: "mb",
        kind: "menu_board",
        props: { emptyMessage: "La carta se está cargando." },
      } as BuilderNode,
    ],
    { menuOfferings: [] },
  );
  assert.match(html, /site-builder-node--menu-board-empty/);
  assert.match(html, /La carta se está cargando\./);
  assert.doesNotMatch(html, /Table reservation|\$0/);
});
