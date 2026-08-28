/**
 * animation-tab-gating.test.ts — the Animation tab shows up everywhere Style
 * does, in the right slot, without an Advanced toggle.
 *
 * THREE things could silently un-ship this tab, and each has a test here:
 *
 *  1. A node kind that gets Style but not Animation. The rule the operator was
 *     given is "every element can animate"; a kind that quietly opts out reads
 *     as a broken element, not a deliberate limit. Asserted across EVERY
 *     standalone builder-node kind in the registry, so a kind added later is
 *     covered without anyone remembering to add it here.
 *  2. The tab landing behind Advanced. It used to, back when it was a row of
 *     CSS-time text inputs. See `advanced-mode-visibility.test.ts`.
 *  3. The dock growing a second tab table. `inspector-tab-config.ts` is the
 *     only map; the rail and the dock body both resolve through it. This file
 *     fails if inspector-dock.tsx brings back a private TABS list.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/animation-tab-gating.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { BUILDER_NODE_REGISTRY } from "@/lib/site-admin/builder-node";
import {
  INSPECTOR_TABS,
  resolveInspectorVisibleTabs,
} from "./inspector-tab-config";
import { ADVANCED_ONLY_INSPECTOR_TABS } from "./advanced-mode-visibility";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A minimal stub per node kind. `resolveInspectorVisibleTabs` only reads `kind`
 * (via the layout/data helpers), so an empty prop bag is enough and keeps this
 * test from having to know every kind's real prop shape.
 */
function stubNode(kind: string) {
  return { id: `stub-${kind}`, kind, props: {}, children: [] };
}

const STANDALONE_KINDS = Object.keys(BUILDER_NODE_REGISTRY).filter(
  (kind) => kind !== "section",
);

test("every standalone node kind that gets Style also gets Animation", () => {
  assert.ok(STANDALONE_KINDS.length > 5, "registry stub lookup went wrong");
  const missing: string[] = [];
  for (const kind of STANDALONE_KINDS) {
    const tabs = resolveInspectorVisibleTabs({
      sectionTypeKey: null,
      selectedStandaloneBuilderNode: stubNode(kind) as never,
    });
    if (tabs.includes("style") && !tabs.includes("motion")) missing.push(kind);
  }
  assert.deepEqual(
    missing,
    [],
    `Node kind(s) offering Style but not Animation: ${missing.join(", ")}.`,
  );
});

test("Animation sits immediately after Style in the rail", () => {
  const order = INSPECTOR_TABS.map((t) => t.key);
  assert.equal(
    order[order.indexOf("style") + 1],
    "motion",
    `Animation must be the fourth tab, right after Style. Got: ${order.join(" ")}`,
  );
});

test("the Animation tab is labelled Animation, not Motion", () => {
  const tab = INSPECTOR_TABS.find((t) => t.key === "motion");
  assert.equal(tab?.label, "Animation");
});

test("the Animation tab is NOT gated behind Advanced mode", () => {
  assert.ok(
    !ADVANCED_ONLY_INSPECTOR_TABS.has("motion"),
    "Animation behind Advanced means most operators never find it.",
  );
});

test("inspector-dock has no private tab table; it uses inspector-tab-config", () => {
  // Importing the dock pulls the whole editor, so read as text.
  const source = readFileSync(join(HERE, "inspector-dock.tsx"), "utf8");
  assert.ok(
    !/const TABS: ReadonlyArray/.test(source),
    "inspector-dock grew a private TABS table. Visible tabs must come from inspector-tab-config.",
  );
  assert.ok(
    !/TABS_BY_SECTION_TYPE/.test(source),
    "inspector-dock grew a private TABS_BY_SECTION_TYPE map. One allow-list lives in inspector-tab-config.",
  );
  assert.ok(
    source.includes("useInspectorVisibleTabs"),
    "inspector-dock no longer reads visible tabs from the shared hook.",
  );
});

test("the dock mounts the Animation panel, not the retired Motion panel", () => {
  const source = readFileSync(join(HERE, "inspector-dock.tsx"), "utf8");
  assert.ok(
    source.includes("./inspectors/animation-panel"),
    "inspector-dock no longer imports the Animation panel.",
  );
  assert.ok(
    !source.includes("node-motion-panel"),
    "inspector-dock still references the deleted node-motion-panel.",
  );
});
