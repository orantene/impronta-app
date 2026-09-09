/**
 * no-unconfigured-native-block — a shipped page design may not render a native
 * block's "not set up yet" placeholder.
 *
 * THE REGRESSION THIS EXISTS FOR
 * ──────────────────────────────
 * `festival.ts` shipped its Passes section as a `ticket_picker` with
 * `eventId: ""`. The island decides NOT CONFIGURED before it fetches anything
 * (`configured = UUID.test(tenantId) && UUID.test(eventId)`,
 * ticket-picker-island.tsx), so the section that used to sell three passes
 * rendered a single line of apology instead — on the template AND on every
 * tenant page built from it. Only the fidelity SCREENSHOT caught it, and only
 * because the page got 287px shorter.
 *
 * A screenshot is the wrong instrument for this. A page design is a seeded
 * default: it has no tenant and no tenant rows, so a self-fetch block that
 * needs an id it cannot be given is never configured, in the template picker
 * or on the published page. This asserts the RENDERED OUTPUT of every design
 * instead of the spelling of any one prop, so a future design that seeds any
 * such block — ticket_picker today, whatever lands next — fails here first.
 *
 * The live picker's home is `/events/<slug>`, where `event-page-view.tsx`
 * mounts it with a real tenant + event and a server-seeded preload.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-node/page-designs/no-unconfigured-native-block.test.tsx
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { PAGE_DESIGNS } from "./index";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "../render";
import type { BuilderNode } from "../types";

/** The `data-ticket-picker`/`data-*-picker` state attribute an island stamps on
 *  its own root when it has nothing it can sell. Matching the STATE attribute
 *  rather than the copy keeps this green through a copy edit or a translation
 *  and red through a real regression. */
const UNCONFIGURED_STATE = /data-[a-z-]*picker="not_configured"/;

/** Belt and braces: the English placeholder sentences themselves. If an island
 *  ever drops the state attribute, the copy still trips the guard. */
const UNCONFIGURED_COPY = [
  "This block is not set up yet",
  "has not been set up yet",
];

function renderDesign(tree: BuilderNode[], dataSources?: BuilderNodeRenderDataSources): string {
  return renderToStaticMarkup(
    renderBuilderNodes(tree, {
      mode: "freeform",
      dataSources,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

for (const design of PAGE_DESIGNS) {
  test(`page design "${design.id}" renders no unconfigured native block`, () => {
    const html = renderDesign(design.tree, design.dataSources);

    assert.doesNotMatch(
      html,
      UNCONFIGURED_STATE,
      `${design.id} renders a native block in its "not configured" state. A seeded ` +
        `design has no tenant and no event, so a self-fetch block dropped into one ` +
        `can never be configured: use a static block, or leave the block out.`,
    );
    for (const sentence of UNCONFIGURED_COPY) {
      assert.ok(
        !html.includes(sentence),
        `${design.id} renders the placeholder sentence "${sentence}".`,
      );
    }
  });
}

test("the festival design still sells its three passes", () => {
  const festival = PAGE_DESIGNS.find((d) => d.id === "festival");
  assert.ok(festival, "the festival design is missing from PAGE_DESIGNS");
  const html = renderDesign(festival.tree, festival.dataSources);

  // The section the regression emptied: a heading, three priced tiers, and a
  // reachable CTA on each. These are the pixels the fidelity golden holds.
  assert.match(html, /Pick your pass/);
  for (const label of ["Day pass", "Festival", "Patron"]) {
    assert.ok(html.includes(label), `the "${label}" tier is gone from the passes section`);
  }
  for (const price of ["$89", "$149", "$320"]) {
    assert.ok(html.includes(price), `the ${price} price is gone from the passes section`);
  }
  for (const cta of ["Buy day pass", "Buy festival pass", "Become a patron"]) {
    assert.ok(html.includes(cta), `the "${cta}" button is gone from the passes section`);
  }
});
