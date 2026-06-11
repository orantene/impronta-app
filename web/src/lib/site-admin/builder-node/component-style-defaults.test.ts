import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import {
  applyComponentStyleDefaults,
  normalizeComponentStyleDefaults,
  validateComponentStyleDefaults,
  isInheritSentinel,
  STYLE_INHERIT_SENTINEL,
  type ComponentStyleDefaults,
} from "./component-style-defaults";
import type { BuilderNode } from "./types";

// A minimal heading node helper.
function headingNode(style?: Record<string, unknown>): BuilderNode {
  return {
    id: "h1",
    kind: "heading",
    props: { text: "Hi", ...(style ? { style } : {}) },
  } as unknown as BuilderNode;
}

function styleOf(node: BuilderNode): Record<string, unknown> {
  return ((node.props as { style?: Record<string, unknown> }).style ??
    {}) as Record<string, unknown>;
}

const DEFAULTS: ComponentStyleDefaults = {
  heading: { textColor: "token:color.ink", fontFamily: "token:typography.heading-font-family" },
  button: { backgroundColor: "token:color.primary" },
};

test("no defaults / no matching kind → node returned by identity (byte-stable)", () => {
  const node = headingNode({ textColor: "#f00" });
  assert.equal(applyComponentStyleDefaults(node, undefined), node);
  assert.equal(applyComponentStyleDefaults(node, {}), node);
  // image kind has no default in DEFAULTS → identity.
  const img = { id: "i", kind: "image", props: { src: "x" } } as unknown as BuilderNode;
  assert.equal(applyComponentStyleDefaults(img, DEFAULTS), img);
});

test("component default fills a field the node did NOT set", () => {
  const node = headingNode(); // no style at all
  const out = applyComponentStyleDefaults(node, DEFAULTS);
  assert.notEqual(out, node); // new node
  assert.deepEqual(styleOf(out), {
    textColor: "token:color.ink",
    fontFamily: "token:typography.heading-font-family",
  });
});

test("node override WINS over the component default", () => {
  const node = headingNode({ textColor: "#e11d48" });
  const out = applyComponentStyleDefaults(node, DEFAULTS);
  const s = styleOf(out);
  assert.equal(s.textColor, "#e11d48"); // node wins
  assert.equal(s.fontFamily, "token:typography.heading-font-family"); // default fills the gap
});

test("@inherit sentinel drops the node value so the default shows through", () => {
  const node = headingNode({ textColor: STYLE_INHERIT_SENTINEL });
  const out = applyComponentStyleDefaults(node, DEFAULTS);
  assert.equal(styleOf(out).textColor, "token:color.ink"); // default wins, not "@inherit"
});

test("@inherit with NO default → field absent (falls through to global/CSS)", () => {
  const node = headingNode({ letterSpacing: STYLE_INHERIT_SENTINEL });
  const out = applyComponentStyleDefaults(node, DEFAULTS);
  assert.equal("letterSpacing" in styleOf(out), false);
});

test("nested responsive/hover layers are preserved from the node", () => {
  const node = headingNode({
    textColor: "#111",
    responsive: { mobile: { textColor: "#222" } },
    hover: { textColor: "#333" },
  });
  const out = applyComponentStyleDefaults(node, DEFAULTS);
  const s = styleOf(out);
  assert.deepEqual(s.responsive, { mobile: { textColor: "#222" } });
  assert.deepEqual(s.hover, { textColor: "#333" });
  assert.equal(s.fontFamily, "token:typography.heading-font-family"); // default still folds in
});

test("isInheritSentinel", () => {
  assert.equal(isInheritSentinel(STYLE_INHERIT_SENTINEL), true);
  assert.equal(isInheritSentinel("#fff"), false);
  assert.equal(isInheritSentinel(undefined), false);
});

test("normalizeComponentStyleDefaults drops unknown kinds + invalid + empties", () => {
  const raw = {
    heading: { textColor: "#111" },
    not_a_kind: { textColor: "#222" },
    button: { fontWeight: 99999 }, // invalid → dropped
    paragraph: {}, // empty → dropped
  };
  const out = normalizeComponentStyleDefaults(raw);
  assert.deepEqual(Object.keys(out).sort(), ["heading"]);
  assert.equal(out.heading?.textColor, "#111");
});

test("normalizeComponentStyleDefaults is total on junk input", () => {
  assert.deepEqual(normalizeComponentStyleDefaults(null), {});
  assert.deepEqual(normalizeComponentStyleDefaults("nope"), {});
  assert.deepEqual(normalizeComponentStyleDefaults(42), {});
});

test("validateComponentStyleDefaults surfaces rejects but still returns the accepted subset", () => {
  const res = validateComponentStyleDefaults({
    heading: { textColor: "#111" },
    bogus: { textColor: "#222" },
  });
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.deepEqual(res.rejected, ["bogus"]);
    assert.equal(res.normalized.heading?.textColor, "#111");
  }
});

test("validateComponentStyleDefaults ok-path on a clean map", () => {
  const res = validateComponentStyleDefaults({ heading: { textColor: "#111" } });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.normalized.heading?.textColor, "#111");
});

// ── End-to-end: cascade flows through renderBuilderNodes into the markup ────
// Proves the OPTION THREADING + render seam together (the same path SSR and the
// editor canvas both call), without touching any live tenant.

function renderHeading(
  style: Record<string, unknown> | undefined,
  defaults: ComponentStyleDefaults | undefined,
): string {
  const node = {
    id: "h1",
    kind: "heading",
    props: { text: "Hi", level: 2, ...(style ? { style } : {}) },
  } as unknown as BuilderNode;
  return renderToStaticMarkup(
    renderBuilderNodes([node], {
      mode: "freeform",
      // Suppress the shared renderer <style> sheet so assertions see ONLY the
      // node's own inline style (the sheet itself references --token-color-* and
      // would otherwise mask whether the cascade applied to THIS node).
      includeRendererStyles: false,
      componentStyleDefaults: defaults,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

test("e2e: no defaults → byte-identical to no-cascade render", () => {
  const a = renderHeading(undefined, undefined);
  const b = renderHeading(undefined, {});
  assert.equal(a, b); // empty defaults change nothing
});

test("e2e: component default paints a heading with no own color", () => {
  const html = renderHeading(undefined, {
    heading: { textColor: "token:color.ink" },
  });
  // token:color.ink resolves to the CSS var with the platform default fallback.
  assert.ok(
    html.includes("var(--token-color-ink"),
    `expected resolved ink var in: ${html}`,
  );
});

test("e2e: node override wins over the component default in the markup", () => {
  const html = renderHeading({ textColor: "#e11d48" }, {
    heading: { textColor: "token:color.ink" },
  });
  assert.ok(html.includes("#e11d48"), "node override present");
  assert.ok(!html.includes("var(--token-color-ink"), "default suppressed");
});

test("e2e: @inherit sentinel lets the default show through in the markup", () => {
  const html = renderHeading({ textColor: STYLE_INHERIT_SENTINEL }, {
    heading: { textColor: "token:color.ink" },
  });
  assert.ok(html.includes("var(--token-color-ink"), "default shows");
  assert.ok(!html.includes(STYLE_INHERIT_SENTINEL), "sentinel never emitted");
});
