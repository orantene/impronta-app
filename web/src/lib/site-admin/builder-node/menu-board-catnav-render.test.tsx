import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import type { BuilderNodeTree } from "./types";

/**
 * The category strip, asserted through the RENDER — not the grouping helper.
 *
 * The helper's rules are unit-tested next door. This asserts the thing a guest
 * sees: that the strip appears when it should, does NOT appear when it should
 * not, and that every tab points at a section id that exists on the page.
 *
 * That last one is the defect this file exists for. A strip whose links resolve
 * to nothing is the exact shape of the C11 anchor bug — a control that looks
 * like navigation and does nothing when tapped — and it is invisible to a test
 * that only checks the strip rendered.
 */

function board(
  categoryNav: boolean,
  offerings: Array<{ id: string; title: string; category?: string | null }>,
): string {
  const tree: BuilderNodeTree = [
    {
      id: "mb",
      kind: "menu_board",
      props: { title: "Menú", categoryNav },
    },
  ] as unknown as BuilderNodeTree;

  return renderToStaticMarkup(
    createElement(
      "div",
      null,
      renderBuilderNodes(tree, {
        mode: "freeform",
        dataSources: {
          menuOfferings: offerings.map((o) => ({
            id: o.id,
            title: o.title,
            description: null,
            amountCents: 1200,
            currency: "MXN",
            priceType: "fixed",
            priceDisplay: "amount",
            kind: "product",
            unitsLeft: null,
            allowPayInPerson: true,
            category: o.category ?? null,
          })),
        },
      } as never),
    ),
  );
}

const CATEGORISED = [
  { id: "1", title: "Taco al pastor", category: "Tacos" },
  { id: "2", title: "Flan", category: "Postres" },
];

test("the strip renders, and every tab points at a section that EXISTS", () => {
  const html = board(true, CATEGORISED);
  assert.match(html, /data-menu-category-nav/, "no category strip rendered");

  const hrefs = [...html.matchAll(/href="#([a-z0-9-]+)"/g)].map((m) => m[1]!);
  assert.ok(hrefs.length >= 2, `expected tabs, found ${hrefs.length}`);

  for (const href of hrefs) {
    assert.match(
      html,
      new RegExp(`id="${href}"`),
      `tab "#${href}" points at a section that does not exist — a link that does nothing`,
    );
  }
});

test("the items still render, grouped — the strip must not replace the menu", () => {
  const html = board(true, CATEGORISED);
  assert.match(html, /Taco al pastor/);
  assert.match(html, /Flan/);
  assert.match(html, /data-menu-category="Tacos"/);
});

test("OFF by default — an existing board is untouched", () => {
  const html = board(false, CATEGORISED);
  assert.doesNotMatch(html, /data-menu-category-nav/);
  assert.match(html, /Taco al pastor/, "the board must still render its items");
});

test("ON but nothing to navigate: no strip, and the menu still renders", () => {
  // El Paisa today: both published items uncategorised. Turning the prop on
  // must not produce an empty strip above a working menu.
  const html = board(true, [
    { id: "1", title: "Taco al pastor" },
    { id: "2", title: "Flan" },
  ]);
  assert.doesNotMatch(html, /data-menu-category-nav/);
  assert.match(html, /Taco al pastor/);
  assert.match(html, /Flan/);
});

test("one category is not navigation", () => {
  const html = board(true, [
    { id: "1", title: "Taco al pastor", category: "Tacos" },
    { id: "2", title: "Taco de suadero", category: "Tacos" },
  ]);
  assert.doesNotMatch(html, /data-menu-category-nav/);
  assert.match(html, /Taco de suadero/);
});
