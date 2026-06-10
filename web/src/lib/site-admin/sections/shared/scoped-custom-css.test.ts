/**
 * scoped-custom-css.test.ts — security regression + node escape-hatch coverage.
 *
 * The section/node custom-CSS scoper (`scopeCustomCss` and its two callers
 * `presentationScopedCss` / `nodeScopedCss`) wraps author CSS so it can only
 * affect its own scope. The OLD scoper interpolated the CSS inside one literal
 * `{ … }` brace pair and only stripped `</style>`/`<script>` — leaving a trivial
 * SCOPE-ESCAPE where a stray `}` closed the scope early and emitted page-global
 * rules:
 *
 *   } body { display: none } .x {
 *
 * This suite proves the hardened scoper closes that hole AND keeps valid CSS
 * working, plus proves the per-node escape hatch emits a correctly-scoped style.
 *
 * Runner: node:test via `tsx --test` (no DOM).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { nodeScopedCss, scopeCustomCss } from "./scoped-custom-css";
import { presentationScopedCss } from "./presentation";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

const SECTION_SCOPE = '[data-cms-section][data-section-id="sec-1"]';

/**
 * Count how many top-level selectors in `css` are NOT prefixed by `scope`. A
 * provably-confined scoper leaves ZERO unscoped top-level rules — every rule
 * begins with the scope (or is inside a scoped at-rule). We approximate "escaped
 * to the page" by checking that a known global target (`body`) never appears as
 * the START of a rule (i.e. `body {` not immediately preceded by the scope).
 */
function hasUnscopedRule(css: string, scope: string, target: string): boolean {
  // Find each `target {` occurrence and verify the scope token sits before it
  // within the same rule (no intervening `}` that would have ended a scope).
  const re = new RegExp(`${target}\\s*\\{`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const before = css.slice(0, m.index);
    // The selector for this rule starts after the last `}` or `{` boundary.
    const lastBoundary = Math.max(before.lastIndexOf("}"), before.lastIndexOf("{"));
    const selector = before.slice(lastBoundary + 1);
    if (!selector.includes(scope)) return true; // an unscoped `target {` rule
  }
  return false;
}

describe("scopeCustomCss — scope-escape hardening (SECURITY)", () => {
  it("BLOCKS the canonical scope-escape: a stray } can no longer emit a page-global rule", () => {
    // BEFORE (old scoper): `<scope> { } body{display:none} <scope> .x {…} }` —
    // the `body{display:none}` rule escaped to the whole page.
    const attack = "} body { display: none } .x { color: red }";
    const out = presentationScopedCss("sec-1", { customCss: attack })!;
    assert.ok(out, "scoper returns CSS");
    // The page-global `body { display:none }` must NOT exist as an unscoped rule.
    assert.equal(
      hasUnscopedRule(out, SECTION_SCOPE, "body"),
      false,
      `scope-escape leaked a global body rule: ${out}`,
    );
    // Concretely: there is no bare `} body {` breakout in the output.
    assert.doesNotMatch(
      out,
      /\}\s*body\s*\{/,
      "no `} body {` breakout survives",
    );
    // The legitimate `.x` rule is preserved AND scoped.
    assert.match(out, new RegExp(`${escapeRe(SECTION_SCOPE)} \\.x \\{`));
  });

  it("BLOCKS multi-} escapes and trailing breakouts", () => {
    const attack = ".a { color: red }} .leak { color: blue } } html { opacity: 0 }";
    const out = scopeCustomCss(SECTION_SCOPE, attack)!;
    // Every emitted rule is prefixed with the scope — `.leak` and `html` can't
    // float free.
    assert.equal(hasUnscopedRule(out, SECTION_SCOPE, "html"), false, out);
    assert.equal(hasUnscopedRule(out, SECTION_SCOPE, "\\.leak"), false, out);
    // Both real selectors survived, scoped.
    assert.match(out, new RegExp(`${escapeRe(SECTION_SCOPE)} \\.a \\{`));
    assert.match(out, new RegExp(`${escapeRe(SECTION_SCOPE)} \\.leak \\{`));
  });

  it("a } hidden inside a comment or string does NOT split the scope", () => {
    const css = '.a { content: "}"; /* } */ color: red }';
    const out = scopeCustomCss(SECTION_SCOPE, css)!;
    // Exactly one scoped rule — the `}` in the string + comment didn't break out.
    const ruleCount = (out.match(new RegExp(escapeRe(SECTION_SCOPE), "g")) ?? []).length;
    assert.equal(ruleCount, 1, `unexpected rule split: ${out}`);
    assert.match(out, /content: ?"\}"/);
  });

  it("still strips </style> and <script> tag-break attempts", () => {
    const css = "</style><script>alert(1)</script> .a { color: red }";
    const out = scopeCustomCss(SECTION_SCOPE, css)!;
    assert.doesNotMatch(out, /<\/style>/i);
    assert.doesNotMatch(out, /<script/i);
  });

  it("scopes a plain valid rule (descendant-confined, not page-global)", () => {
    const out = scopeCustomCss(SECTION_SCOPE, ".headline { letter-spacing: -0.02em }")!;
    assert.equal(
      out,
      `${SECTION_SCOPE} .headline { letter-spacing: -0.02em }`,
    );
  });

  it("scopes EACH selector in a comma list", () => {
    const out = scopeCustomCss(SECTION_SCOPE, ".a, .b { color: red }")!;
    assert.match(out, new RegExp(`${escapeRe(SECTION_SCOPE)} \\.a, ${escapeRe(SECTION_SCOPE)} \\.b \\{`));
  });

  it("scopes the INNER rules of a nesting at-rule (@media), keeping the at-rule intact", () => {
    const out = scopeCustomCss(
      SECTION_SCOPE,
      "@media (max-width: 640px) { .a { color: red } }",
    )!;
    assert.match(out, /@media \(max-width: 640px\) \{/);
    assert.match(out, new RegExp(`${escapeRe(SECTION_SCOPE)} \\.a \\{`));
  });

  it("passes a rule-less at-rule (@keyframes) through WITHOUT scoping its inner steps", () => {
    const out = scopeCustomCss(
      SECTION_SCOPE,
      "@keyframes spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }",
    )!;
    assert.match(out, /@keyframes spin \{/);
    // The `from`/`to` steps are NOT prefixed with the section scope (that would
    // break the keyframe).
    assert.doesNotMatch(out, new RegExp(`${escapeRe(SECTION_SCOPE)} from`));
  });

  it("returns null for empty / whitespace-only CSS", () => {
    assert.equal(scopeCustomCss(SECTION_SCOPE, ""), null);
    assert.equal(scopeCustomCss(SECTION_SCOPE, "   \n  "), null);
    assert.equal(presentationScopedCss("sec-1", { customCss: "" }), null);
    assert.equal(presentationScopedCss("sec-1", undefined), null);
  });
});

describe("nodeScopedCss + render integration — per-node escape hatch", () => {
  function render(nodes: BuilderNode[]): string {
    return renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        renderBuilderNodes(nodes, { mode: "freeform" }),
      ) as Parameters<typeof renderToStaticMarkup>[0],
    );
  }

  it("nodeScopedCss keys CSS to the node's [data-builder-node-id]", () => {
    const out = nodeScopedCss("node-42", ".inner { color: red }")!;
    assert.equal(out, `[data-builder-node-id="node-42"] .inner { color: red }`);
  });

  it("a node WITH customCss emits a correctly-scoped <style> for that node", () => {
    const nodes: BuilderNode[] = [
      {
        id: "hero-heading",
        kind: "heading",
        props: {
          text: "Hello",
          level: 2,
          style: { customCss: ".x { color: rebeccapurple }" },
        },
      },
    ];
    const html = render(nodes);
    // The node renders normally...
    assert.match(html, /data-builder-node-id="hero-heading"/);
    // ...and a scoped <style> is emitted, keyed to that node id.
    assert.match(html, /data-builder-node-custom-css="hero-heading"/);
    assert.match(
      html,
      /\[data-builder-node-id="hero-heading"\] \.x \{ color: rebeccapurple \}/,
    );
  });

  it("a node customCss scope-escape attempt is confined (no page-global leak)", () => {
    const nodes: BuilderNode[] = [
      {
        id: "n1",
        kind: "heading",
        props: {
          text: "Hi",
          level: 2,
          style: { customCss: "} body { display: none } .x { color: red }" },
        },
      },
    ];
    const html = render(nodes);
    assert.doesNotMatch(html, /\}\s*body\s*\{/, "no `} body {` breakout in node CSS");
    assert.match(
      html,
      /\[data-builder-node-id="n1"\] \.x \{/,
      "legit rule stays scoped to the node",
    );
  });

  it("a node WITHOUT customCss emits NO extra <style> (byte-stable / additive)", () => {
    const withCss: BuilderNode[] = [
      {
        id: "n2",
        kind: "heading",
        props: { text: "Hi", level: 2, style: { customCss: ".x { color: red }" } },
      },
    ];
    const withoutCss: BuilderNode[] = [
      { id: "n2", kind: "heading", props: { text: "Hi", level: 2 } },
    ];
    const htmlWith = render(withCss);
    const htmlWithout = render(withoutCss);
    assert.match(htmlWith, /data-builder-node-custom-css/);
    assert.doesNotMatch(
      htmlWithout,
      /data-builder-node-custom-css/,
      "absent customCss → no per-node style tag",
    );
  });
});

/** Escape a string for use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
