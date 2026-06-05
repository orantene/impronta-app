import assert from "node:assert/strict";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";

import { renderBuilderNodes, type BuilderNode } from "./index";

function tree(condition: unknown): BuilderNode[] {
  return [
    {
      id: "always",
      kind: "heading",
      props: { text: "ALWAYS", level: 2 },
    },
    {
      id: "conditional",
      kind: "heading",
      // Stored where the editor patch path leaves it (props) — render must read it.
      props: { text: "CONDITIONAL", level: 2, visibilityCondition: condition },
    },
  ] as BuilderNode[];
}

function render(nodes: BuilderNode[], options?: Parameters<typeof renderBuilderNodes>[1]): string {
  return renderToStaticMarkup(
    createElement(Fragment, null, renderBuilderNodes(nodes, options)),
  );
}

// ── locale ───────────────────────────────────────────────────────────────────

test("a locale-conditional node is OMITTED on a different locale", () => {
  const html = render(tree({ locale: "es" }), {
    visibilityContext: { locale: "en" },
  });
  assert.match(html, /ALWAYS/);
  assert.doesNotMatch(html, /CONDITIONAL/);
});

test("a locale-conditional node RENDERS on its locale", () => {
  const html = render(tree({ locale: "es" }), {
    visibilityContext: { locale: "es" },
  });
  assert.match(html, /ALWAYS/);
  assert.match(html, /CONDITIONAL/);
});

// ── auth ─────────────────────────────────────────────────────────────────────

test("a signed-in-only node is hidden from signed-out visitors", () => {
  const html = render(tree({ auth: "signed_in" }), {
    visibilityContext: { signedIn: false },
  });
  assert.doesNotMatch(html, /CONDITIONAL/);
});

test("a signed-in-only node shows to signed-in visitors", () => {
  const html = render(tree({ auth: "signed_in" }), {
    visibilityContext: { signedIn: true },
  });
  assert.match(html, /CONDITIONAL/);
});

// ── graceful defaults ────────────────────────────────────────────────────────

test("NO visibility context → conditional node still renders (never hides on missing signal)", () => {
  const html = render(tree({ locale: "es" }));
  assert.match(html, /CONDITIONAL/);
});

test("a node with no condition is unaffected by the context", () => {
  const html = render(
    [{ id: "x", kind: "heading", props: { text: "PLAIN", level: 2 } } as BuilderNode],
    { visibilityContext: { locale: "en", signedIn: false } },
  );
  assert.match(html, /PLAIN/);
});

// ── a hidden node nested in a container is omitted too ────────────────────────

test("conditional visibility applies to nested children", () => {
  const nested: BuilderNode[] = [
    {
      id: "wrap",
      kind: "container",
      props: { layout: "stack" },
      children: [
        { id: "shown", kind: "paragraph", props: { text: "SHOWN" } },
        {
          id: "hidden",
          kind: "paragraph",
          props: { text: "HIDDEN", visibilityCondition: { locale: "es" } },
        },
      ],
    },
  ] as BuilderNode[];
  const html = render(nested, { visibilityContext: { locale: "en" } });
  assert.match(html, /SHOWN/);
  assert.doesNotMatch(html, /HIDDEN/);
});
