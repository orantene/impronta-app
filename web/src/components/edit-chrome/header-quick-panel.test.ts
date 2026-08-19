import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

import { findHeaderTargets } from "./header-quick-panel";
import { selectionIsInHeader } from "./header-quick-panel-mount";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

const SHELL = [
  {
    id: "hdr",
    kind: "section",
    props: { sectionTypeKey: "site_header", ejected: true },
    children: [
      {
        id: "bar",
        kind: "container",
        props: { layout: "row" },
        children: [
          { id: "logo", kind: "image", props: { src: "/logo.png" } },
          { id: "nav", kind: "nav", props: { links: [] } },
          { id: "w1", kind: "section_embed", props: { sectionTypeKey: "header_search" } },
          { id: "w2", kind: "section_embed", props: { sectionTypeKey: "header_account" } },
        ],
      },
    ],
  },
  {
    id: "ftr",
    kind: "section",
    props: { sectionTypeKey: "site_footer", ejected: true },
    children: [{ id: "fnav", kind: "nav", props: { links: [] } }],
  },
] as unknown as BuilderNodeTree;

test("targets are found by KIND, not by id", () => {
  // Shell trees are seeded per tenant with their own id prefixes; anything
  // keyed to a name works for one site and silently does nothing for the next.
  const t = findHeaderTargets(SHELL);
  assert.equal(t.logoNodeId, "logo");
  assert.equal(t.navNodeId, "nav");
  assert.equal(t.barNodeId, "bar");
  assert.equal(t.actionCount, 2);
});

test("a header with nothing in it yields no targets, not wrong ones", () => {
  // Rows for missing pieces render disabled. Pointing them at the closest node
  // instead would open an inspector for something the operator did not mean.
  const bare = [
    { id: "hdr", kind: "section", props: { sectionTypeKey: "site_header" }, children: [] },
  ] as unknown as BuilderNodeTree;
  const t = findHeaderTargets(bare);
  assert.equal(t.logoNodeId, null);
  assert.equal(t.navNodeId, null);
  assert.equal(t.actionCount, 0);
});

test("selecting anything inside the header counts as being in it", () => {
  // An operator who clicked the logo is still in the header and should be
  // offered its tasks.
  for (const id of ["hdr", "bar", "logo", "nav", "w1"]) {
    assert.equal(selectionIsInHeader(SHELL, id), true, `${id} should be in the header`);
  }
});

test("the footer is not the header", () => {
  assert.equal(selectionIsInHeader(SHELL, "ftr"), false);
  assert.equal(selectionIsInHeader(SHELL, "fnav"), false, "a footer nav is not a header nav");
  assert.equal(selectionIsInHeader(SHELL, null), false);
  assert.equal(selectionIsInHeader(SHELL, "nope"), false);
});

test("the panel routes, it does not duplicate state", () => {
  // The failure mode of every "quick settings" screen is a second copy of the
  // state that drifts. Every row must hand off to the surface that owns the job.
  const src = readFileSync(new URL("./header-quick-panel.tsx", import.meta.url), "utf8");
  for (const writer of ["commitPatch", "patchBuilderNodeProps", "useState("]) {
    assert.ok(!src.includes(writer), `the panel must not own state or writes (${writer})`);
  }
  for (const handoff of ["selectBuilderNode", "requestInspectorTab", "toggleBrandPanel", "openTheme", "setMobileEditMode"]) {
    assert.ok(src.includes(handoff), `missing handoff: ${handoff}`);
  }
});

test("the launcher stays off pages that have no shell", () => {
  const mount = readFileSync(
    new URL("./header-quick-panel-mount.tsx", import.meta.url),
    "utf8",
  );
  assert.match(mount, /surfaceKind === "site_shell"/);
  // The tree subscription must live here, not in edit-shell.tsx, which is
  // explicitly non-subscribing for perf.
  assert.match(mount, /useBuilderTree\(\)/);
  // And edit-shell must mount it WITHOUT threading a tree prop through — that
  // would move the subscription up into the chrome root, which the file's own
  // PERF note says re-renders everything below it on every commit.
  const shell = readFileSync(new URL("./edit-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /<HeaderQuickPanelMount \/>/);
});
