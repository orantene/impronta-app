import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { collectMobileOverflowOffenders } from "./mobile-health";
import {
  FIXED_LENGTH_MAX_PX,
  FONT_SIZE_MAX_PX,
  FREE_MARGIN_MAX_PX,
  GAP_MAX_PX,
  MAX_TREE_DEPTH,
  PADDING_MAX_PX,
  TRANSLATE_MAX_PERCENT,
  TRANSLATE_MAX_PX,
  normalizeBuilderTreeLayout,
  normalizeUnknownBuilderTreeLayout,
} from "./normalize-tree-layout";
import { renderBuilderNodes } from "./render";
import type { BuilderNode, BuilderNodeTree } from "./types";
import { validateBuilderNodeTree } from "./validate";

/**
 * normalize-tree-layout.test.ts — the acceptance bar for the draft-save
 * normalization gate. The property most likely to be violated by a careless
 * clamp is CONTENT PRESERVATION, so it is tested hardest: seeded random trees
 * (valid and corrupt), random absurd style values, deep wrapper chains — and
 * the assertion that every text / label / href / src / alt string in the input
 * survives, byte-identical, in the output.
 */

// ── Content multiset (the preservation oracle) ──────────────────────────────

const CONTENT_KEYS = new Set(["text", "label", "href", "src", "alt", "title"]);

function collectContent(value: unknown, out: Map<string, number>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectContent(item, out);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (CONTENT_KEYS.has(key) && typeof v === "string" && v.length > 0) {
      out.set(v, (out.get(v) ?? 0) + 1);
    }
    collectContent(v, out);
  }
}

function contentMultiset(tree: unknown): Map<string, number> {
  const out = new Map<string, number>();
  collectContent(tree, out);
  return out;
}

function assertContentPreserved(input: unknown, output: unknown, label: string): void {
  const before = contentMultiset(input);
  const after = contentMultiset(output);
  for (const [text, count] of before) {
    const kept = after.get(text) ?? 0;
    assert.ok(
      kept >= count,
      `${label}: content "${text.slice(0, 60)}" lost (had ${count}, kept ${kept})`,
    );
  }
}

// ── Seeded PRNG + generators ────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rnd: () => number, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)]!;
}

let nextId = 0;
function freshId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

const ABSURD_FONT_SIZES = ["16px", "9999px", "-5px", "NaNpx", "2rem", "clamp(1rem,2vw,2rem)"];
const ABSURD_WIDTHS = ["50000px", "100%", "auto", "-40px", "320px", "max-content"];
const ABSURD_PADDINGS = ["24px", "4000px", "-20px", "clamp(24px, 4vw, 56px)"];
const ABSURD_TRANSLATES = ["99999px 99999px", "10px -8px", "500% -800%", "12vw 3rem"];
const ABSURD_MARGINS = ["-5000px", "10px", "-40px", "9000px"];
const ABSURD_GAPS = ["10000px", "16px", "-2px"];

function randomStyle(rnd: () => number, tame = false): Record<string, unknown> {
  const style: Record<string, unknown> = {};
  if (rnd() < 0.5) style.fontSize = pick(rnd, ABSURD_FONT_SIZES);
  if (rnd() < 0.5) style.width = pick(rnd, ABSURD_WIDTHS);
  if (rnd() < 0.3) style.minWidth = pick(rnd, ABSURD_WIDTHS);
  if (rnd() < 0.4) style.paddingTop = pick(rnd, ABSURD_PADDINGS);
  if (rnd() < 0.3) style.marginTopFree = pick(rnd, ABSURD_MARGINS);
  if (rnd() < 0.3) style.gap = pick(rnd, ABSURD_GAPS);
  if (rnd() < 0.4) style.translate = pick(rnd, ABSURD_TRANSLATES);
  if (!tame && rnd() < 0.3) style.opacity = pick(rnd, [0.5, 7, -3, Number.NaN]);
  if (!tame && rnd() < 0.3) style.zIndex = pick(rnd, [5, 1_000_000, -1_000_000]);
  if (rnd() < 0.3) {
    style.responsive = {
      mobile: { fontSize: pick(rnd, ABSURD_FONT_SIZES), width: pick(rnd, ABSURD_WIDTHS) },
    };
  }
  return style;
}

function randomLeaf(rnd: () => number, tame = false): Record<string, unknown> {
  const kind = pick(rnd, ["heading", "paragraph", "button", "image"] as const);
  const style = randomStyle(rnd, tame);
  switch (kind) {
    case "heading":
      return {
        id: freshId("h"),
        kind,
        props: { text: `Heading ${freshId("t")}`, level: 2, style },
      };
    case "paragraph":
      return {
        id: freshId("p"),
        kind,
        props: { text: `Copy body ${freshId("t")}`, style },
      };
    case "button":
      return {
        id: freshId("b"),
        kind,
        props: { label: `Label ${freshId("t")}`, href: `/go/${freshId("t")}`, style },
      };
    case "image":
      return {
        id: freshId("i"),
        kind,
        props: { src: `https://cdn.example/${freshId("t")}.jpg`, alt: `Alt ${freshId("t")}`, style },
      };
  }
}

/** A container chain `depth` wrappers deep ending in leaves — the depth-cap fodder. */
function containerChain(
  rnd: () => number,
  depth: number,
  tame = false,
): Record<string, unknown> {
  if (depth <= 1) return randomLeaf(rnd, tame);
  return {
    id: freshId("c"),
    kind: "container",
    props: {
      layout: pick(rnd, ["stack", "row", "grid"] as const),
      style: randomStyle(rnd, tame),
    },
    children: [
      containerChain(rnd, depth - 1, tame),
      ...(rnd() < 0.4 ? [randomLeaf(rnd, tame)] : []),
    ],
  };
}

function randomTree(rnd: () => number, tame = false): unknown[] {
  const roots: unknown[] = [];
  const rootCount = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < rootCount; i += 1) {
    // A tame tree stays inside the strict validator's depth cap (root section
    // + chain <= 8); the wild generator goes far past it on purpose.
    const deep = rnd() < 0.5;
    const chainDepth = tame
      ? 2 + Math.floor(rnd() * 4)
      : deep
        ? 6 + Math.floor(rnd() * 8)
        : 2 + Math.floor(rnd() * 3);
    const chain = containerChain(rnd, chainDepth, tame);
    if (rnd() < 0.5) {
      roots.push({
        id: freshId("s"),
        kind: "section",
        props: { sectionTypeKey: "custom", label: `Band ${freshId("t")}` },
        children: [chain],
      });
    } else {
      roots.push(chain);
    }
  }
  // Sometimes inject outright garbage entries — the gate must pass them through.
  if (!tame && rnd() < 0.2) {
    roots.push({ id: freshId("x"), kind: "not_a_kind", props: { text: `Ghost ${freshId("t")}` } });
  }
  return roots;
}

function treeDepth(node: unknown): number {
  if (typeof node !== "object" || node === null) return 1;
  const children = (node as { children?: unknown }).children;
  if (!Array.isArray(children) || children.length === 0) return 1;
  return 1 + Math.max(...children.map(treeDepth));
}

// ── Style-invariant walker ──────────────────────────────────────────────────

function pxOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = /^(-?\d+(?:\.\d+)?)(px)?$/.exec(value.trim());
  return m ? Number.parseFloat(m[1]!) : null;
}

function assertBucketClamped(bucket: Record<string, unknown>, path: string): void {
  const fs = pxOf(bucket.fontSize);
  if (fs !== null) {
    assert.ok(fs >= 0 && fs <= FONT_SIZE_MAX_PX, `${path}: fontSize ${bucket.fontSize}`);
  }
  for (const key of ["width", "height", "minWidth", "minHeight", "maxWidthFree", "maxHeight"]) {
    const v = pxOf(bucket[key]);
    if (v !== null) assert.ok(v >= 0 && v <= FIXED_LENGTH_MAX_PX, `${path}: ${key} ${bucket[key]}`);
  }
  for (const key of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) {
    const v = pxOf(bucket[key]);
    if (v !== null) assert.ok(v >= 0 && v <= PADDING_MAX_PX, `${path}: ${key} ${bucket[key]}`);
  }
  const gap = pxOf(bucket.gap);
  if (gap !== null) assert.ok(gap >= 0 && gap <= GAP_MAX_PX, `${path}: gap ${bucket.gap}`);
  for (const key of ["marginTopFree", "marginRightFree", "marginBottomFree", "marginLeftFree"]) {
    const v = pxOf(bucket[key]);
    if (v !== null) assert.ok(Math.abs(v) <= FREE_MARGIN_MAX_PX, `${path}: ${key} ${bucket[key]}`);
  }
  if (typeof bucket.translate === "string") {
    for (const part of bucket.translate.split(/\s+/)) {
      const px = pxOf(part);
      if (px !== null) assert.ok(Math.abs(px) <= TRANSLATE_MAX_PX, `${path}: translate ${part}`);
      const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(part);
      if (pct) {
        assert.ok(
          Math.abs(Number.parseFloat(pct[1]!)) <= TRANSLATE_MAX_PERCENT,
          `${path}: translate ${part}`,
        );
      }
    }
  }
  if (typeof bucket.opacity === "number") {
    assert.ok(bucket.opacity >= 0 && bucket.opacity <= 1, `${path}: opacity ${bucket.opacity}`);
  }
}

function assertStylesClamped(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertStylesClamped(item, `${path}[${i}]`));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const node = value as Record<string, unknown>;
  const props = node.props as Record<string, unknown> | undefined;
  const style = props && typeof props === "object" ? (props.style as Record<string, unknown> | undefined) : undefined;
  if (style && typeof style === "object" && !Array.isArray(style)) {
    assertBucketClamped(style, `${path}.style`);
    const responsive = style.responsive as Record<string, unknown> | undefined;
    if (responsive && typeof responsive === "object") {
      for (const [name, bucket] of Object.entries(responsive)) {
        if (bucket && typeof bucket === "object" && !Array.isArray(bucket)) {
          assertBucketClamped(bucket as Record<string, unknown>, `${path}.style.responsive.${name}`);
        }
      }
    }
  }
  if (Array.isArray(node.children)) assertStylesClamped(node.children, `${path}.children`);
}

// ── Property tests (the acceptance bar) ─────────────────────────────────────

test("property: content is preserved across 250 random trees (valid and corrupt)", () => {
  const rnd = mulberry32(0xbeef);
  for (let run = 0; run < 250; run += 1) {
    const input = randomTree(rnd);
    const snapshot = structuredClone(input);
    const output = normalizeUnknownBuilderTreeLayout(input);
    assertContentPreserved(snapshot, output, `run ${run}`);
    // The gate must also never mutate its input.
    assert.deepEqual(input, snapshot, `run ${run}: input was mutated`);
  }
});

test("property: idempotence — normalize(normalize(t)) deep-equals normalize(t)", () => {
  const rnd = mulberry32(0xcafe);
  for (let run = 0; run < 150; run += 1) {
    const input = randomTree(rnd);
    const once = normalizeUnknownBuilderTreeLayout(input);
    const twice = normalizeUnknownBuilderTreeLayout(structuredClone(once));
    assert.deepEqual(twice, once, `run ${run}: not idempotent`);
  }
});

test("property: every parseable px escape in the output satisfies its clamp", () => {
  const rnd = mulberry32(0xdead);
  for (let run = 0; run < 150; run += 1) {
    const output = normalizeUnknownBuilderTreeLayout(randomTree(rnd));
    assertStylesClamped(output, `run ${run}`);
  }
});

test("property: container wrapper chains are flattened to the depth cap, content intact", () => {
  const rnd = mulberry32(0xf00d);
  for (let run = 0; run < 100; run += 1) {
    const input = [
      {
        id: freshId("s"),
        kind: "section",
        props: { sectionTypeKey: "custom" },
        children: [containerChain(rnd, 8 + Math.floor(rnd() * 8))],
      },
    ];
    const snapshot = structuredClone(input);
    const output = normalizeUnknownBuilderTreeLayout(input) as unknown[];
    for (const root of output) {
      assert.ok(
        treeDepth(root) <= MAX_TREE_DEPTH,
        `run ${run}: depth ${treeDepth(root)} > ${MAX_TREE_DEPTH}`,
      );
    }
    assertContentPreserved(snapshot, output, `depth run ${run}`);
  }
});

test("property: a strictly-valid tree stays strictly valid, and its mobile blockers clear", () => {
  const rnd = mulberry32(0xabcd);
  let validSeen = 0;
  for (let run = 0; run < 200; run += 1) {
    const input = randomTree(rnd, true);
    if (!validateBuilderNodeTree(input).ok) continue;
    validSeen += 1;
    const output = normalizeUnknownBuilderTreeLayout(input);
    assert.ok(
      validateBuilderNodeTree(output).ok,
      `run ${run}: valid input became invalid`,
    );
    assert.deepEqual(
      collectMobileOverflowOffenders(output as BuilderNodeTree),
      [],
      `run ${run}: publish-blocking mobile overflow survived normalization`,
    );
  }
  assert.ok(validSeen >= 20, `generator produced too few valid trees (${validSeen})`);
});

// ── Deterministic clamp behavior ────────────────────────────────────────────

test("absurd values are clamped, not deleted; relative values pass through", () => {
  const tree = [
    {
      id: "c1",
      kind: "container",
      props: {
        layout: "stack",
        style: {
          fontSize: "9999px",
          width: "50000px",
          paddingTop: "4000px",
          gap: "10000px",
          marginTopFree: "-5000px",
          translate: "99999px -700%",
          opacity: 7,
          zIndex: 1_000_000,
          height: "clamp(10vh, 20vh, 30vh)",
        },
      },
      children: [],
    },
  ];
  const [out] = normalizeUnknownBuilderTreeLayout(tree) as Array<{
    props: { style: Record<string, unknown> };
  }>;
  const style = out!.props.style;
  assert.equal(style.fontSize, `${FONT_SIZE_MAX_PX}px`);
  assert.equal(style.width, `${FIXED_LENGTH_MAX_PX}px`);
  assert.equal(style.paddingTop, `${PADDING_MAX_PX}px`);
  assert.equal(style.gap, `${GAP_MAX_PX}px`);
  assert.equal(style.marginTopFree, `${-FREE_MARGIN_MAX_PX}px`);
  assert.equal(style.translate, `${TRANSLATE_MAX_PX}px ${-TRANSLATE_MAX_PERCENT}%`);
  assert.equal(style.opacity, 1);
  assert.equal(style.zIndex, 9999);
  assert.equal(style.height, "clamp(10vh, 20vh, 30vh)", "relative values untouched");
});

test("unrenderable lengths (negative / NaN) are dropped; negative free margins survive", () => {
  const tree = [
    {
      id: "c1",
      kind: "container",
      props: {
        layout: "stack",
        style: {
          width: "-40px",
          paddingLeft: "-20px",
          fontSize: "NaNpx",
          marginBottomFree: "-40px",
        },
      },
      children: [],
    },
  ];
  const [out] = normalizeUnknownBuilderTreeLayout(tree) as Array<{
    props: { style: Record<string, unknown> };
  }>;
  const style = out!.props.style;
  assert.equal(style.width, undefined);
  assert.equal(style.paddingLeft, undefined);
  assert.equal(style.fontSize, undefined);
  assert.equal(style.marginBottomFree, "-40px", "a legitimate overlap margin is preserved");
});

test("a corrupt draft round-trips its content instead of being wiped", () => {
  // This tree would FAIL strict validation (unknown kind + broken props), so
  // the old strict gate would have dropped nodes. The normalizer must keep
  // every byte of the user's content.
  const corrupt = [
    { id: "weird", kind: "not_a_real_kind", props: { text: "My precious copy" } },
    {
      id: "h1",
      kind: "heading",
      props: { text: "Half-finished headline", level: 99, style: { fontSize: "80000px" } },
    },
    { totally: "malformed" },
    "even a stray string",
  ];
  const snapshot = structuredClone(corrupt);
  const output = normalizeUnknownBuilderTreeLayout(corrupt) as unknown[];
  assert.equal(output.length, 4, "no node may be dropped");
  assertContentPreserved(snapshot, output, "corrupt draft");
  assert.ok(!validateBuilderNodeTree(output).ok, "still invalid — publish keeps gating it");
});

test("non-array input passes through untouched", () => {
  assert.equal(normalizeUnknownBuilderTreeLayout(null), null);
  assert.equal(normalizeUnknownBuilderTreeLayout(undefined), undefined);
  const bag = { not: "a tree" };
  assert.equal(normalizeUnknownBuilderTreeLayout(bag), bag);
});

// ── The real shipped incident, made structurally impossible ─────────────────

test("incident regression: a non-shrinking header row cannot make the page scroll sideways", () => {
  // The shipped bug: a header row of non-shrinking fixed-width flex items
  // measured wider than a 390px phone, nothing clipped it, so the DOCUMENT
  // grew and every page scrolled horizontally. Two mechanisms now make that
  // impossible; both are asserted here.
  const headerRow: BuilderNodeTree = [
    {
      id: "band",
      kind: "section",
      props: { sectionTypeKey: "custom", label: "Header" },
      children: [
        {
          id: "row",
          kind: "container",
          props: {
            layout: "row",
            style: { width: "1120px" },
          },
          children: [
            {
              id: "logo",
              kind: "image",
              props: {
                src: "https://cdn.example/logo.svg",
                alt: "Logo",
                style: { width: "420px", flexShrink: 0 },
              },
            },
            {
              id: "cta",
              kind: "button",
              props: {
                label: "Book now",
                href: "/book",
                style: { minWidth: "480px", flexShrink: 0 },
              },
            },
          ] as BuilderNode[],
        },
      ],
    } as BuilderNode,
  ];

  // Mechanism 1 — the draft normalizer resolves every DEFINITE mobile overflow
  // (the publish-blocking class) into responsive.mobile overrides.
  assert.ok(validateBuilderNodeTree(headerRow).ok, "fixture must be a valid tree");
  assert.ok(
    collectMobileOverflowOffenders(headerRow).length > 0,
    "fixture must reproduce the blocking overflow before normalization",
  );
  const normalized = normalizeBuilderTreeLayout(headerRow);
  assert.deepEqual(
    collectMobileOverflowOffenders(normalized),
    [],
    "after a draft save, no node can definitely overflow a 390px phone",
  );
  assertContentPreserved(headerRow, normalized, "incident fixture");

  // Mechanism 2 — the renderer band invariant: every root-level page band
  // clips its own horizontal overflow (overflow-x:clip, NOT hidden, so sticky
  // headers keep working), in the editor canvas and on the published page
  // alike. Even content the static analyzer cannot see (measured flex rows)
  // can widen only its band, never the document.
  // Render the band's content through the shared renderer (the generic path
  // skips bare `section` roots, so render the row itself — any node pulls the
  // shared sheet in).
  const bandChildren = (normalized[0] as { children?: BuilderNode[] }).children ?? [];
  const markup = renderToStaticMarkup(
    createElement("div", null, renderBuilderNodes(bandChildren, {}) as ReactNode),
  );
  assert.ok(
    markup.includes("[data-cms-section],[data-cms-block]{max-width:100%;overflow-x:clip}"),
    "the shared renderer sheet must carry the band overflow invariant",
  );
});

test("depth flattening splices wrapper children in place, preserving order", () => {
  // 10 nested containers around one heading → flattened to ≤ 8 levels with the
  // heading (and every sibling) intact and in order.
  let inner: Record<string, unknown> = {
    id: "leaf-h",
    kind: "heading",
    props: { text: "Deep headline", level: 2 },
  };
  for (let i = 0; i < 10; i += 1) {
    inner = {
      id: `wrap-${i}`,
      kind: "container",
      props: { layout: "stack" },
      children: [inner],
    };
  }
  const tree = [
    {
      id: "root-section",
      kind: "section",
      props: { sectionTypeKey: "custom" },
      children: [inner],
    },
  ];
  const output = normalizeUnknownBuilderTreeLayout(tree) as unknown[];
  assert.ok(treeDepth(output[0]) <= MAX_TREE_DEPTH);
  assertContentPreserved(tree, output, "deep chain");
  assert.ok(validateBuilderNodeTree(output).ok, "flattened tree passes strict validation");
});
