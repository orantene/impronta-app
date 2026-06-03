import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import { BUILDER_NODE_REGISTRY } from "./registry";
import type { BuilderNode } from "./types";
import {
  STYLE_BINDABLE_COLOR_TOKENS,
  STYLE_BINDABLE_FONT_FAMILY_TOKENS,
  isStyleTokenRef,
  parseStyleTokenRef,
  resolveStyleTokenRef,
  styleTokenRef,
} from "./style-token-bindings";

function render(nodes: ReadonlyArray<BuilderNode>): string {
  return renderToStaticMarkup(
    createElement(Fragment, null, renderBuilderNodes(nodes, { publicPathPrefix: "/t" })),
  );
}

describe("style-token-bindings: catalog", () => {
  it("derives the color catalog from the registry (incl. all brand + editorial tokens, not the old hardcoded 8)", () => {
    const keys = STYLE_BINDABLE_COLOR_TOKENS.map((t) => t.key);
    for (const expected of [
      "color.primary",
      "color.secondary",
      "color.accent",
      "color.neutral",
      "color.background", // was MISSING from the old hardcoded list
      "color.blush", // was MISSING
      "color.sage", // was MISSING
      "color.ink",
      "color.muted",
      "color.line",
      "color.surface-raised",
    ]) {
      assert.ok(keys.includes(expected), `catalog should include ${expected}`);
    }
    // Every color binding carries a --token-* var + a hex fallback from the registry.
    for (const t of STYLE_BINDABLE_COLOR_TOKENS) {
      assert.match(t.cssVar, /^--token-color-/);
      assert.match(t.fallback, /^#[0-9a-f]{3,6}$/i);
    }
  });

  it("exposes the two theme font-family bindings against the resolved site font vars", () => {
    const keys = STYLE_BINDABLE_FONT_FAMILY_TOKENS.map((t) => t.key);
    assert.deepEqual(keys.sort(), [
      "typography.body-font-family",
      "typography.heading-font-family",
    ]);
    const vars = STYLE_BINDABLE_FONT_FAMILY_TOKENS.map((t) => t.cssVar).sort();
    assert.deepEqual(vars, ["--site-body-font", "--site-heading-font"]);
  });
});

describe("style-token-bindings: parse / guard helpers", () => {
  it("isStyleTokenRef only matches the token: sentinel", () => {
    assert.equal(isStyleTokenRef("token:color.primary"), true);
    assert.equal(isStyleTokenRef("#C9A227"), false);
    assert.equal(isStyleTokenRef("rgb(1,2,3)"), false);
    assert.equal(isStyleTokenRef("var(--token-color-primary)"), false);
    assert.equal(isStyleTokenRef(undefined), false);
    assert.equal(isStyleTokenRef(null), false);
  });

  it("styleTokenRef + parseStyleTokenRef round-trip a known token", () => {
    const ref = styleTokenRef("color.accent");
    assert.equal(ref, "token:color.accent");
    const parsed = parseStyleTokenRef(ref);
    assert.ok(parsed);
    assert.equal(parsed?.key, "color.accent");
    assert.equal(parsed?.cssVar, "--token-color-accent");
  });

  it("parseStyleTokenRef returns null for raw values and unknown keys", () => {
    assert.equal(parseStyleTokenRef("#111111"), null);
    assert.equal(parseStyleTokenRef("token:color.does-not-exist"), null);
    assert.equal(parseStyleTokenRef("token:"), null);
  });
});

describe("style-token-bindings: resolveStyleTokenRef", () => {
  it("maps a color sentinel to var(--token-color-*, fallback)", () => {
    assert.equal(
      resolveStyleTokenRef("token:color.primary"),
      "var(--token-color-primary, #111111)",
    );
    assert.equal(
      resolveStyleTokenRef("token:color.surface-raised"),
      "var(--token-color-surface-raised, #ffffff)",
    );
  });

  it("maps a font-family sentinel to the resolved site font var", () => {
    assert.equal(
      resolveStyleTokenRef("token:typography.heading-font-family"),
      "var(--site-heading-font, inherit)",
    );
  });

  it("returns RAW values untouched (the back-compat / byte-identity guarantee)", () => {
    for (const raw of [
      "#C9A227",
      "#fff",
      "rgb(10, 20, 30)",
      "rgba(0,0,0,0.5)",
      "hsl(210 40% 50%)",
      "currentColor",
      "transparent",
      // a literal var() (the OLD implicit encoding) is NOT a sentinel → untouched
      "var(--token-color-primary, #111111)",
      '"Playfair Display", serif',
    ]) {
      assert.equal(resolveStyleTokenRef(raw), raw);
    }
  });

  it("degrades an UNKNOWN token key to undefined (never an invalid declaration)", () => {
    assert.equal(resolveStyleTokenRef("token:color.retired"), undefined);
  });

  it("passes through non-string inputs (number / undefined) unchanged", () => {
    assert.equal(resolveStyleTokenRef(undefined), undefined);
    assert.equal(resolveStyleTokenRef(0.5), 0.5);
  });
});

describe("renderer: token binding cascades to CSS vars / inline styles", () => {
  it("emits var(--token-color-primary, …) inline for a token-bound textColor", () => {
    const html = render([
      {
        id: "free:h",
        kind: "heading",
        props: {
          text: "Bound heading",
          level: 2,
          style: { textColor: "token:color.primary" },
        },
      },
    ]);
    assert.match(html, /color:var\(--token-color-primary, ?#111111\)/);
  });

  it("emits var(--token-color-accent, …) for a token-bound fill", () => {
    const html = render([
      {
        id: "free:c",
        kind: "card",
        props: { variant: "outline", style: { backgroundColor: "token:color.accent" } },
        children: [
          { id: "free:c:h", kind: "heading", props: { text: "Hi", level: 3 } },
        ],
      },
    ]);
    assert.match(html, /background-color:var\(--token-color-accent, ?#0ea5e9\)/);
  });

  it("binds fontFamily to the theme heading font var", () => {
    const html = render([
      {
        id: "free:hf",
        kind: "heading",
        props: {
          text: "Themed type",
          level: 1,
          style: { fontFamily: "token:typography.heading-font-family" },
        },
      },
    ]);
    assert.match(html, /font-family:var\(--site-heading-font, ?inherit\)/);
  });

  it("RAW color values render exactly as authored (no var() wrapping)", () => {
    const html = render([
      {
        id: "free:raw",
        kind: "heading",
        props: { text: "Raw", level: 2, style: { textColor: "#C9A227" } },
      },
    ]);
    // The raw hex is emitted verbatim …
    assert.match(html, /color:#C9A227/i);
    // … and the node's OWN inline style is not token-wrapped. (We scope the
    // negative check to the node markup, since the static <style> prelude
    // legitimately references --token-color-* in the button/pricing rules.)
    const nodeMarkup = /<h2[^>]*data-builder-node-id="free:raw"[^>]*>/.exec(html)?.[0] ?? "";
    assert.ok(nodeMarkup.length > 0, "raw heading node should render");
    assert.doesNotMatch(nodeMarkup, /var\(--token-color-/);
    assert.match(nodeMarkup, /color:#C9A227/i);
  });

  it("a token-bound responsive (mobile) color sets the breakpoint var", () => {
    const html = render([
      {
        id: "free:rsp",
        kind: "paragraph",
        props: {
          text: "Responsive bound",
          style: { responsive: { mobile: { textColor: "token:color.muted" } } },
        },
      },
    ]);
    assert.match(html, /--bn-mobile-text-color:var\(--token-color-muted/);
    assert.match(html, /data-builder-style-mobile-text-color/);
  });
});

describe("schema: token-aware color validation", () => {
  it("accepts a valid token: reference on a color field", () => {
    const parsed = BUILDER_NODE_REGISTRY.heading.propsSchema.parse({
      text: "x",
      level: 2,
      style: { textColor: "token:color.primary", backgroundColor: "#fff" },
    });
    assert.ok(parsed);
  });

  it("rejects a malformed token: reference (unknown key) at authoring time", () => {
    assert.throws(() =>
      BUILDER_NODE_REGISTRY.heading.propsSchema.parse({
        text: "x",
        level: 2,
        style: { textColor: "token:color.not-real" },
      }),
    );
  });

  it("still accepts raw hex / rgb / literal var() values", () => {
    for (const raw of ["#C9A227", "rgb(1,2,3)", "var(--token-color-primary, #111)"]) {
      const parsed = BUILDER_NODE_REGISTRY.heading.propsSchema.parse({
        text: "x",
        level: 2,
        style: { textColor: raw },
      });
      assert.ok(parsed);
    }
  });
});
