import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { THEME_PRESETS } from "@/lib/site-admin/presets/theme-presets";
import {
  MAX_SITE_TEMPLATE_ORDER,
  buildMaxSiteTemplateTrees,
} from "../max-site-templates/registry";
import { isLookOwnedTokenKey } from "./look-layer";
import type { DesignPayload } from "./types";
import { validateDesign, validateLook } from "./validate";

function seqIds(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

/** A starter template converted to a Design payload (talent-agnostic shell). */
function designFor(key: (typeof MAX_SITE_TEMPLATE_ORDER)[number]): DesignPayload {
  return buildMaxSiteTemplateTrees(key, { displayName: "{{displayName}}" }, seqIds(key));
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function firstNode(tree: BuilderNode[], pred: (n: BuilderNode) => boolean): BuilderNode {
  const stack = [...tree];
  while (stack.length) {
    const n = stack.shift()!;
    if (pred(n)) return n;
    if ("children" in n && Array.isArray(n.children)) stack.push(...n.children);
  }
  throw new Error("node not found");
}

const MODERN_LOOK = {
  tokens: Object.fromEntries(
    Object.entries(THEME_PRESETS.find((p) => p.slug === "modern-2026")!.tokens).filter(([k]) =>
      isLookOwnedTokenKey(k),
    ),
  ),
};

// ── Designs ──────────────────────────────────────────────────────────────────

for (const key of MAX_SITE_TEMPLATE_ORDER) {
  test(`converted design "${key}" validates`, () => {
    const result = validateDesign(designFor(key));
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
  });

  test(`converted design "${key}" keeps provenance through validateBuilderNodeTree`, () => {
    const { shellTree, homeTree } = designFor(key);
    const shell = validateBuilderNodeTree(shellTree);
    const home = validateBuilderNodeTree(homeTree);
    assert.ok(shell.ok && home.ok);
    // The persisted (validated) trees must still pass: slotKey + originRole survive.
    const again = validateDesign({ shellTree: shell.tree, homeTree: home.tree });
    assert.deepEqual(again.errors, []);
  });
}

test("a hex literal in a style prop is rejected", () => {
  const design = clone(designFor("editorial"));
  const heading = firstNode(design.homeTree, (n) => n.kind === "heading");
  (heading.props as { style?: Record<string, unknown> }).style = { textColor: "#ff0000" };
  const result = validateDesign(design);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /literal colour|token:color/.test(e)), result.errors.join("\n"));
});

test("an rgba() literal hidden in a background gradient is rejected", () => {
  const design = clone(designFor("bold"));
  const hero = design.homeTree[0]!;
  const style = (hero.props as { style: Record<string, unknown> }).style;
  style.backgroundImage = "linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(x.jpg)";
  assert.equal(validateDesign(design).ok, false);
});

test("a raw font-family stack is rejected", () => {
  const design = clone(designFor("minimal"));
  const heading = firstNode(design.homeTree, (n) => n.kind === "heading");
  (heading.props as { style?: Record<string, unknown> }).style = { fontFamily: '"Playfair Display", serif' };
  const result = validateDesign(design);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("fontFamily")));
});

test("a non-kit top-level section is rejected", () => {
  const design = clone(designFor("default"));
  design.homeTree.splice(1, 0, {
    id: "rogue",
    kind: "container",
    props: { layout: "stack", slotKey: "pricing", originRole: "talent.pricing" },
    children: [],
  } as BuilderNode);
  const result = validateDesign(design);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("talent.pricing")));
});

test("a top-level section without slotKey/originRole is rejected", () => {
  const design = clone(designFor("portfolio"));
  const about = design.homeTree[2]!;
  const props = about.props as Record<string, unknown>;
  delete props.slotKey;
  delete props.originRole;
  assert.equal(validateDesign(design).ok, false);
});

test("missing hero is rejected", () => {
  const design = clone(designFor("default"));
  design.homeTree = design.homeTree.filter(
    (n) => (n.props as { slotKey?: string }).slotKey !== "hero",
  );
  const result = validateDesign(design);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("hero")));
});

test("missing contact is rejected", () => {
  const design = clone(designFor("minimal"));
  design.homeTree = design.homeTree.filter(
    (n) => (n.props as { slotKey?: string }).slotKey !== "contact",
  );
  const result = validateDesign(design);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("contact")));
});

test("raw html / code nodes and custom CSS are rejected", () => {
  const withCode = clone(designFor("default"));
  const about = withCode.homeTree[1]! as BuilderNode & { children: BuilderNode[] };
  about.children.push({ id: "code-1", kind: "code", props: { html: "<b>x</b>" } } as unknown as BuilderNode);
  assert.equal(validateDesign(withCode).ok, false);

  const withCss = clone(designFor("default"));
  (withCss.homeTree[1]!.props as { style: Record<string, unknown> }).style.customCss = "color: red";
  assert.equal(validateDesign(withCss).ok, false);
});

test("a shell without a footer landmark is rejected", () => {
  const design = clone(designFor("minimal"));
  design.shellTree = design.shellTree.slice(0, 1);
  assert.equal(validateDesign(design).ok, false);
});

test("a malformed payload is rejected, never thrown", () => {
  assert.equal(validateDesign(null).ok, false);
  assert.equal(validateDesign({ shellTree: [] }).ok, false);
});

// ── Looks ────────────────────────────────────────────────────────────────────

test("the Modern 2026 colour + font layer validates as a Look", () => {
  const result = validateLook(MODERN_LOOK);
  assert.deepEqual(result.errors, []);
});

test("a low-contrast Look is rejected (ink on background)", () => {
  const look = clone(MODERN_LOOK);
  look.tokens["color.ink"] = "#dddddd";
  const result = validateLook(look);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("color.ink")));
});

test("a low-contrast primary is rejected (primary on background)", () => {
  const look = clone(MODERN_LOOK);
  look.tokens["color.primary"] = "#f0f0f0";
  const result = validateLook(look);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("color.primary")));
});

test("an unknown token key is rejected", () => {
  const look = clone(MODERN_LOOK);
  look.tokens["color.not-a-token"] = "#123456";
  assert.equal(validateLook(look).ok, false);
});

test("a token outside the Look layer is rejected (radius belongs to the site)", () => {
  const look = clone(MODERN_LOOK);
  look.tokens["radius.scale-preset"] = "soft";
  const result = validateLook(look);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("radius.scale-preset")));
});

test("an unknown font family is rejected; registry and Google fonts pass", () => {
  const bad = clone(MODERN_LOOK);
  bad.tokens["typography.heading-font-family"] = '"Totally Made Up Sans", sans-serif';
  assert.equal(validateLook(bad).ok, false);

  const good = clone(MODERN_LOOK);
  good.tokens["typography.heading-font-family"] = '"Playfair Display", Georgia, serif';
  good.tokens["typography.body-font-family"] = '"Roboto", system-ui, sans-serif';
  assert.deepEqual(validateLook(good).errors, []);
});

test("a Look must set background, ink and primary explicitly", () => {
  const look = clone(MODERN_LOOK);
  delete look.tokens["color.background"];
  const result = validateLook(look);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("color.background")));
});

test("a derived token (color.primary-on) and a bad value are rejected", () => {
  const derived = clone(MODERN_LOOK);
  derived.tokens["color.primary-on"] = "#ffffff";
  assert.equal(validateLook(derived).ok, false);

  const badValue = clone(MODERN_LOOK);
  badValue.tokens["color.accent"] = "sky blue";
  assert.equal(validateLook(badValue).ok, false);
});
