import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { BUILDER_NODE_REGISTRY } from "@/lib/site-admin/builder-node";
import { resolveInspectorVisibleTabs } from "./inspector-tab-config";

const HERE = dirname(fileURLToPath(import.meta.url));

function stubNode(kind: string) {
  return { id: `stub-${kind}`, kind, props: {}, children: [] };
}

// D-182: the in-page anchor (C11) is a base field on every node, but it lived
// only in the Data tab's bindable branch and the rail offered the Data tab only
// to bindable kinds. A plain block (event_program, location_map, a card grid)
// could never be a link target from the editor. Every standalone kind now gets
// the Data tab, and every DataPanel branch renders the anchor field.
test("every standalone node kind gets the Data tab (anchor + visibility live there)", () => {
  const kinds = Object.keys(BUILDER_NODE_REGISTRY).filter((k) => k !== "section");
  assert.ok(kinds.includes("event_program"), "event_program is registered");
  const missing = kinds.filter(
    (kind) =>
      !resolveInspectorVisibleTabs({
        sectionTypeKey: null,
        selectedStandaloneBuilderNode: stubNode(kind) as never,
      }).includes("data"),
  );
  assert.deepEqual(missing, [], `kinds without a Data tab: ${missing.join(", ")}`);
});

test("the anchor field renders in every DataPanel branch", () => {
  const src = readFileSync(join(HERE, "inspectors/data-panel.tsx"), "utf8");
  const uses = src.match(/<AnchorSection\b/g)?.length ?? 0;
  assert.equal(uses, 3, "bindable, field-bindings and unsupported branches all mount the anchor field");
  assert.match(src, /data-builder-anchor-input=""/);
});
