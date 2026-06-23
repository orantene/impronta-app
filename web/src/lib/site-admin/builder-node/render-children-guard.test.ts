import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

/**
 * Regression: the renderer must NOT crash on a malformed / legacy / AI-authored
 * draft tree whose container-kind node has `children` undefined. These kinds
 * type `children` as required, but the live edit-mode canvas bridge renders the
 * draft WITHOUT a `validateBuilderNodeTree` normalization pass — so an unguarded
 * `node.children.filter/.map/.slice/.find` threw "reading 'filter' of undefined"
 * and blanked the whole canvas. Same class as the snapshot.slots crash (#646).
 * All renderer children reads now go through the `nodeChildren()` guard.
 */

function render(nodes: BuilderNode[], options: Parameters<typeof renderBuilderNodes>[1] = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, { mode: "freeform", ...options }) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );
}

// Every container-ish kind whose render path reads node.children.
const CONTAINER_KINDS = [
  "container",
  "split",
  "accordion",
  "accordion_item",
  "tabs",
  "tab_panel",
  "carousel",
] as const;

for (const kind of CONTAINER_KINDS) {
  test(`renderer tolerates a ${kind} node with undefined children`, () => {
    // Deliberately malformed: `children` omitted though the type requires it.
    const node = { id: `n_${kind}`, kind, props: {} } as unknown as BuilderNode;
    assert.doesNotThrow(() => render([node]));
  });
}

test("renderer tolerates a data-bound container (featured talent) with undefined children", () => {
  // Hits renderFeaturedTalentChildren, which slices node.children — the live
  // data source has items, so the unguarded slice was reachable.
  const node = {
    id: "dbc",
    kind: "container",
    props: { dataBinding: { sourceKey: "featured_talent_profiles", maxItems: 4 } },
  } as unknown as BuilderNode;
  assert.doesNotThrow(() =>
    render([node], {
      dataSources: {
        featuredTalentProfiles: [
          {
            id: "t1",
            displayName: "Test Talent",
            thumbnailUrl: null,
            profileCode: "TAL-1",
          },
        ],
      } as unknown as Parameters<typeof renderBuilderNodes>[1]["dataSources"],
    }),
  );
});

test("renderer still renders real children when present (guard is not a no-op)", () => {
  const node = {
    id: "split-1",
    kind: "split",
    props: {},
    children: [
      { id: "h1", kind: "heading", props: { text: "Hello", level: 2 } },
    ],
  } as unknown as BuilderNode;
  const html = render([node]);
  assert.match(html, /Hello/);
});
