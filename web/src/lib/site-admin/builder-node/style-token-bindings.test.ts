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
  STYLE_BINDABLE_RADIUS_TOKENS,
  STYLE_BINDABLE_SHADOW_TOKENS,
  STYLE_BINDABLE_SPACING_TOKENS,
  STYLE_BINDABLE_FONT_SIZE_TOKENS,
  bindableTokensForStyleProp,
  isBindableTokenKey,
  isStyleTokenRef,
  parseStyleTokenRef,
  rebindRawToTokenRef,
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

describe("style-token-bindings: derived theme catalog (radius / shadow / spacing / type-scale)", () => {
  it("exposes radius tokens bound to the consumable --site-radius-* vars", () => {
    const byKey = new Map(STYLE_BINDABLE_RADIUS_TOKENS.map((t) => [t.key, t]));
    assert.equal(byKey.get("radius.base")?.cssVar, "--site-radius-base");
    assert.equal(byKey.get("radius.sm")?.cssVar, "--site-radius-sm");
    assert.equal(byKey.get("radius.lg")?.cssVar, "--site-radius-lg");
    assert.equal(byKey.get("radius.pill")?.cssVar, "--site-radius-pill");
    for (const t of STYLE_BINDABLE_RADIUS_TOKENS) assert.equal(t.kind, "radius");
  });

  it("exposes shadow tokens bound to the consumable --site-shadow-* vars", () => {
    const byKey = new Map(STYLE_BINDABLE_SHADOW_TOKENS.map((t) => [t.key, t]));
    assert.equal(byKey.get("shadow.soft")?.cssVar, "--site-shadow-soft");
    assert.equal(byKey.get("shadow.ambient")?.cssVar, "--site-shadow-ambient");
    for (const t of STYLE_BINDABLE_SHADOW_TOKENS) assert.equal(t.kind, "shadow");
  });

  it("exposes the section-rhythm spacing token + type-scale tokens", () => {
    assert.ok(
      STYLE_BINDABLE_SPACING_TOKENS.some(
        (t) => t.key === "space.section-y" && t.cssVar === "--site-section-y",
      ),
    );
    const fsKeys = STYLE_BINDABLE_FONT_SIZE_TOKENS.map((t) => t.key);
    for (const k of ["typography.h1-size", "typography.h2-size", "typography.body-size"]) {
      assert.ok(fsKeys.includes(k), `type-scale catalog should include ${k}`);
    }
  });

  it("isBindableTokenKey accepts the new derived keys (so the schema refine passes)", () => {
    for (const k of [
      "radius.base",
      "radius.pill",
      "shadow.soft",
      "space.section-y",
      "typography.h2-size",
    ]) {
      assert.equal(isBindableTokenKey(k), true, `${k} should be bindable`);
    }
    assert.equal(isBindableTokenKey("radius.not-real"), false);
  });
});

describe("style-token-bindings: resolveStyleTokenRef on derived tokens (byte-identical render path)", () => {
  it("resolves a radius sentinel to var(--site-radius-base, fallback)", () => {
    assert.equal(
      resolveStyleTokenRef("token:radius.base"),
      "var(--site-radius-base, 0.5rem)",
    );
    assert.equal(
      resolveStyleTokenRef("token:radius.pill"),
      "var(--site-radius-pill, 999px)",
    );
  });

  it("resolves a shadow sentinel to var(--site-shadow-soft, fallback)", () => {
    assert.equal(
      resolveStyleTokenRef("token:shadow.soft"),
      "var(--site-shadow-soft, 0 6px 16px -8px rgba(17, 17, 17, 0.12))",
    );
  });

  it("resolves a spacing + type-scale sentinel", () => {
    assert.equal(
      resolveStyleTokenRef("token:space.section-y"),
      "var(--site-section-y, 72px)",
    );
    assert.equal(
      resolveStyleTokenRef("token:typography.h2-size"),
      "var(--token-typography-h2-size, inherit)",
    );
  });

  it("STILL returns raw radius/shadow/spacing values untouched (back-compat)", () => {
    for (const raw of ["12px", "0.5rem", "50%", "999px", "0 2px 8px rgba(0,0,0,.4)"]) {
      assert.equal(resolveStyleTokenRef(raw), raw);
    }
  });
});

describe("style-token-bindings: per-prop binding catalog", () => {
  it("offers radius tokens for borderRadius, shadow for boxShadow, spacing for padding/gap", () => {
    assert.deepEqual(
      bindableTokensForStyleProp("borderRadius").map((t) => t.kind),
      STYLE_BINDABLE_RADIUS_TOKENS.map(() => "radius"),
    );
    assert.equal(bindableTokensForStyleProp("boxShadow")[0]?.kind, "shadow");
    assert.equal(bindableTokensForStyleProp("paddingTop")[0]?.kind, "spacing");
    assert.equal(bindableTokensForStyleProp("gap")[0]?.kind, "spacing");
    assert.equal(bindableTokensForStyleProp("fontSize")[0]?.kind, "font-size");
    // A prop with no theme binding returns an empty list.
    assert.deepEqual(bindableTokensForStyleProp("filter"), []);
  });
});

describe("style-token-bindings: rebindRawToTokenRef (conservative exact-match)", () => {
  it("rebinds an EXACT radius value to its token sentinel", () => {
    assert.equal(rebindRawToTokenRef("0.5rem", "radius"), "token:radius.base");
    assert.equal(rebindRawToTokenRef("999px", "radius"), "token:radius.pill");
  });

  it("rebinds an EXACT shadow value to its token sentinel", () => {
    assert.equal(
      rebindRawToTokenRef("0 6px 16px -8px rgba(17, 17, 17, 0.12)", "shadow"),
      "token:shadow.soft",
    );
  });

  it("rebinds an EXACT color hex (case-insensitive) to its token sentinel", () => {
    assert.equal(rebindRawToTokenRef("#0ea5e9", "color"), "token:color.accent");
    assert.equal(rebindRawToTokenRef("#0EA5E9", "color"), "token:color.accent");
  });

  it("does NOT rebind a near / non-matching value (conservative)", () => {
    assert.equal(rebindRawToTokenRef("0.51rem", "radius"), null);
    assert.equal(rebindRawToTokenRef("13px", "spacing"), null);
    assert.equal(rebindRawToTokenRef("#abcdef", "color"), null);
  });

  it("does NOT cross kinds — a radius value won't rebind under a spacing kind", () => {
    // "999px" is a radius fallback; asking for a spacing rebind must not match it.
    assert.equal(rebindRawToTokenRef("999px", "spacing"), null);
  });

  it("returns null for an already-bound value or empty input", () => {
    assert.equal(rebindRawToTokenRef("token:radius.base", "radius"), null);
    assert.equal(rebindRawToTokenRef("", "radius"), null);
    assert.equal(rebindRawToTokenRef(undefined, "radius"), null);
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

  it("emits var(--site-radius-base, …) inline for a token-bound borderRadius", () => {
    const html = render([
      {
        id: "free:rad",
        kind: "card",
        props: { variant: "outline", style: { borderRadius: "token:radius.base" } },
        children: [
          { id: "free:rad:h", kind: "heading", props: { text: "Hi", level: 3 } },
        ],
      },
    ]);
    assert.match(html, /border-radius:var\(--site-radius-base, ?0\.5rem\)/);
  });

  it("emits var(--site-shadow-soft, …) inline for a token-bound boxShadow", () => {
    const html = render([
      {
        id: "free:shadow",
        kind: "card",
        props: { variant: "outline", style: { boxShadow: "token:shadow.soft" } },
        children: [
          { id: "free:shadow:h", kind: "heading", props: { text: "Hi", level: 3 } },
        ],
      },
    ]);
    assert.match(html, /box-shadow:var\(--site-shadow-soft, ?0 6px 16px/);
  });

  it("emits var(--site-section-y, …) on --bn-gap for a token-bound gap", () => {
    const html = render([
      {
        id: "free:gap",
        kind: "container",
        props: { layout: "stack", style: { gap: "token:space.section-y" } },
        children: [
          { id: "free:gap:h", kind: "heading", props: { text: "Hi", level: 3 } },
        ],
      },
    ]);
    assert.match(html, /--bn-gap:var\(--site-section-y, ?72px\)/);
  });

  it("RAW radius/shadow/gap values render exactly as authored (no var() wrap)", () => {
    const html = render([
      {
        id: "free:rawbox",
        kind: "card",
        props: {
          variant: "outline",
          style: { borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,.4)" },
        },
        children: [
          { id: "free:rawbox:h", kind: "heading", props: { text: "Hi", level: 3 } },
        ],
      },
    ]);
    assert.match(html, /border-radius:14px/);
    assert.match(html, /box-shadow:0 2px 8px/);
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
