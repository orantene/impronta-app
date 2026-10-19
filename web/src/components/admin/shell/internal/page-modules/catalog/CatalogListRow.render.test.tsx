import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { blankOffering } from "@/lib/talent/offerings-types";
import { CatalogRow } from "./CatalogListRow";
import { LIST_COLS } from "./catalog-list-columns";

/**
 * B2: the desktop row (the grid one, not the phone row) renders the item name
 * in its Item cell, with the full name as the tooltip, on the container-tier
 * columns. No browser here: the widths are summed in catalog-list-columns.test.ts;
 * this pins the markup those sums are about.
 */

function render(title: string) {
  const item = { ...blankOffering({ kind: "workspace", tenantId: "t1" }, "MXN", 0), id: "o1", title, amountCents: 12000 };
  return renderToStaticMarkup(
    <CatalogRow
      item={item}
      index={0}
      count={1}
      locale="es"
      primary="es"
      locales={["es"]}
      nav={{ href: () => "/admin/catalog?item=o1", go: () => undefined }}
      editor={{ patchItem: () => undefined, duplicate: () => undefined, move: () => undefined }}
      menuOpen={false}
      onMenu={() => undefined}
      onMenuClose={() => undefined}
      onRemove={() => undefined}
      onArchive={() => undefined}
    />,
  );
}

function desktopRow(html: string): string {
  const at = html.indexOf('data-testid="catalog-row"');
  assert.ok(at > 0, "the desktop grid row renders");
  return html.slice(html.lastIndexOf("<div", at));
}

test("the desktop row carries the item name in its Item cell, with a title tooltip", () => {
  const row = desktopRow(render("Corte de cabello con lavado y peinado"));
  assert.match(row, /data-testid="catalog-row-item"/);
  assert.match(row, /title="Corte de cabello con lavado y peinado"[^>]*data-testid="catalog-row-title"[^>]*>Corte de cabello con lavado y peinado</);
});

test("the desktop row is laid out on the container tiers, and the Item cell is never hidden", () => {
  const row = desktopRow(render("Espresso"));
  const rowClass = /class="([^"]+)"/.exec(row)?.[1] ?? "";
  for (const cls of LIST_COLS.split(" ")) assert.ok(rowClass.includes(cls), `row has ${cls}`);
  assert.doesNotMatch(rowClass, /grid-cols-\[1\.35fr_120px/, "not the fixed 774px board template");
  const itemCell = /<span class="([^"]+)" data-testid="catalog-row-item"/.exec(row)?.[1] ?? "";
  assert.ok(itemCell.includes("min-w-0"), "the Item cell can shrink without pushing the row wider");
  assert.doesNotMatch(itemCell, /(^|\s)hidden(\s|$)/, "the Item cell shows at every width");
});

test("an untitled item still shows a name, and the phone row keeps its own copy", () => {
  const html = render("");
  assert.match(desktopRow(html), /data-testid="catalog-row-title"[^>]*>[^<]+</);
  assert.match(html, /data-testid="catalog-row-phone"/);
});
