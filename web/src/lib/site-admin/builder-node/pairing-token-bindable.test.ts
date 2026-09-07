import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { designTokensToCssVars } from "@/lib/site-admin/tokens/resolve";

import {
  isBindableTokenKey,
  styleTokenRef,
} from "./style-token-bindings";
import { validateBuilderNodeTree } from "./validate";
import { renderBuilderNodes } from "./render";
import type { BuilderNodeTree } from "./types";

/**
 * `token:color.primary-on` must VALIDATE and RENDER.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The derived contrast pair was projected as a CSS var but never registered as
 * a token. `registry.ts` refines every `token:<key>` style value with
 * `isBindableTokenKey`, so a node binding it failed validation — and an invalid
 * node makes `resolveSnapshotBuilderTree` fall back to a tree built from
 * `slots`, which for the page-less fallback is EMPTY. One unbindable key
 * blanked a whole live page.
 *
 * That is the third time in one day that a single invalid node discarded an
 * entire page (the others: `menu_board` under `container`, and an unbaked
 * design tree). The failure mode of this renderer is silence, so the fix is
 * asserted at BOTH ends here: the key is bindable, and a node using it survives
 * validation all the way to markup.
 */

test("color.primary-on is a bindable token key", () => {
  assert.ok(
    isBindableTokenKey("color.primary-on"),
    "the derived pair must be bindable, or a node using it fails validation and " +
      "takes the whole tree down with it",
  );
});

test("a node binding token:color.primary-on VALIDATES", () => {
  const tree: BuilderNodeTree = [
    {
      id: "n1",
      kind: "container",
      props: {
        layout: "stack",
        style: {
          backgroundColor: styleTokenRef("color.primary"),
          textColor: styleTokenRef("color.primary-on"),
        },
      },
      children: [],
    },
  ] as unknown as BuilderNodeTree;

  const result = validateBuilderNodeTree(tree);
  assert.equal(
    result.ok,
    true,
    `the paired binding must validate; issues: ${
      result.ok ? "" : JSON.stringify(result.issues)
    }`,
  );
});

test("...and RENDERS, because validating is not the same as rendering", () => {
  const tree: BuilderNodeTree = [
    {
      id: "n1",
      kind: "container",
      props: {
        layout: "stack",
        style: {
          backgroundColor: styleTokenRef("color.primary"),
          textColor: styleTokenRef("color.primary-on"),
        },
      },
      children: [],
    },
  ] as unknown as BuilderNodeTree;

  const validated = validateBuilderNodeTree(tree);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  const html = renderToStaticMarkup(
    createElement("div", null, renderBuilderNodes(validated.tree, { mode: "freeform" })),
  );
  assert.match(
    html,
    /data-builder-node-kind="container"/,
    "the node bound to the pair rendered nothing",
  );
});

test("the projection still DERIVES the value; a stored one cannot win", () => {
  // The registry entry makes the key bindable. It must not make the value
  // authorable: the pair is computed from the primary, and letting a stored
  // value through would break the contrast guarantee the token exists for.
  const vars = designTokensToCssVars({
    "color.primary": "#111111",
    "color.primary-on": "#ff00ff", // an operator-supplied value, if one existed
  });
  assert.equal(
    vars["--token-color-primary-on"],
    "#ffffff",
    "the derived value must win over any stored one",
  );
});
