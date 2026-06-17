/**
 * STYLE-2 — 'display' heading size tier above XL.
 *
 * Verifies:
 * 1. 'display' yields the largest clamp (above XL) in the renderer CSS.
 * 2. Existing sm/md/lg/xl tiers are byte-stable (unchanged clamps).
 * 3. The 'display' value is accepted by the Zod schema in registry.ts.
 * 4. A heading node with size:"display" emits data-builder-style-size="display".
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { renderBuilderNodes } from "./render";
import { builderNodeStyleValueSchema } from "./registry";
import type { BuilderNode } from "./types";

// ── helpers ────────────────────────────────────────────────────────────────

/** Render a single-node tree and extract the injected <style> CSS. */
function getCss(): string {
  const tree: BuilderNode[] = [
    { id: "h-dummy", kind: "heading", props: { text: "X", level: 1 } },
  ];
  const html = renderToStaticMarkup(
    renderBuilderNodes(tree, { includeRendererStyles: true }),
  );
  // The <style> is injected as the first element
  const match = html.match(/<style[^>]*>([\s\S]+?)<\/style>/);
  assert.ok(match, "renderBuilderNodes must inject a <style> block");
  return match[1];
}

/** Parse the max-value from a clamp() in the renderer CSS for the given tier. */
function extractMaxRem(css: string, tier: string): number {
  const re = new RegExp(
    `\\.site-builder-node\\[data-builder-style-size="${tier}"\\]\\{font-size:clamp\\([^,]+,[^,]+,([^)]+)\\)`,
  );
  const match = css.match(re);
  assert.ok(match, `No CSS rule found for size="${tier}"`);
  const raw = match[1].trim();
  if (raw.endsWith("rem")) return parseFloat(raw);
  if (raw.endsWith("px")) return parseFloat(raw) / 16;
  assert.fail(`Unexpected unit in clamp max for "${tier}": ${raw}`);
}

// ── 1. CSS clamp ordering ──────────────────────────────────────────────────

test("STYLE-2: 'display' CSS clamp is larger than all existing size tiers", () => {
  const css = getCss();

  const smMax = extractMaxRem(css, "sm");
  const mdMax = extractMaxRem(css, "md");
  const lgMax = extractMaxRem(css, "lg");
  const xlMax = extractMaxRem(css, "xl");
  const displayMax = extractMaxRem(css, "display");

  assert.ok(smMax < mdMax, `sm (${smMax}rem) < md (${mdMax}rem)`);
  assert.ok(mdMax < lgMax, `md (${mdMax}rem) < lg (${lgMax}rem)`);
  assert.ok(lgMax < xlMax, `lg (${lgMax}rem) < xl (${xlMax}rem)`);
  assert.ok(
    xlMax < displayMax,
    `xl (${xlMax}rem) must be strictly less than display (${displayMax}rem)`,
  );
});

// ── 2. Existing tiers byte-stable ─────────────────────────────────────────

test("STYLE-2: existing sm/md/lg/xl clamps are byte-identical after adding display", () => {
  const css = getCss();

  const EXPECTED: Readonly<Record<string, string>> = {
    sm: "clamp(0.9rem,1vw,1rem)",
    md: "clamp(1rem,1.3vw,1.25rem)",
    lg: "clamp(1.35rem,2vw,2.25rem)",
    xl: "clamp(2rem,4vw,4.5rem)",
  };

  for (const [tier, expected] of Object.entries(EXPECTED)) {
    // Escape special chars for the regex pattern
    const escapedExpected = expected.replace(/[().,]/g, (c) => `\\${c}`);
    const re = new RegExp(
      `\\.site-builder-node\\[data-builder-style-size="${tier}"\\]\\{font-size:${escapedExpected}`,
    );
    assert.match(css, re, `size="${tier}" clamp must remain byte-stable as: ${expected}`);
  }
});

// ── 3. Zod schema accepts 'display' ───────────────────────────────────────

test("STYLE-2: builderNodeStyleValueSchema accepts size:display without error", () => {
  const result = builderNodeStyleValueSchema.safeParse({ size: "display" });
  assert.ok(
    result.success,
    `Zod rejected size:'display': ${JSON.stringify((result as { error?: unknown }).error)}`,
  );
  assert.equal(result.data?.size, "display");
});

test("STYLE-2: builderNodeStyleValueSchema still accepts all pre-existing sizes", () => {
  for (const size of ["sm", "md", "lg", "xl"] as const) {
    const result = builderNodeStyleValueSchema.safeParse({ size });
    assert.ok(result.success, `Zod rejected size:'${size}'`);
    assert.equal(result.data?.size, size);
  }
});

// ── 4. Heading node emits the correct data attribute ──────────────────────

test("STYLE-2: heading with size:display emits data-builder-style-size='display'", () => {
  const tree: BuilderNode[] = [
    {
      id: "h1",
      kind: "heading",
      props: {
        text: "Display heading",
        level: 1,
        style: { size: "display" },
      },
    },
  ];
  const html = renderToStaticMarkup(
    renderBuilderNodes(tree, { includeRendererStyles: false }),
  );
  assert.match(
    html,
    /data-builder-style-size="display"/,
    "heading with size:display must emit the display data attribute",
  );
});

test("STYLE-2: heading with size:xl still emits data-builder-style-size='xl' (byte-stable)", () => {
  const tree: BuilderNode[] = [
    {
      id: "h2",
      kind: "heading",
      props: {
        text: "XL heading",
        level: 2,
        style: { size: "xl" },
      },
    },
  ];
  const html = renderToStaticMarkup(
    renderBuilderNodes(tree, { includeRendererStyles: false }),
  );
  assert.match(
    html,
    /data-builder-style-size="xl"/,
    "heading with size:xl must still emit xl unchanged",
  );
  assert.doesNotMatch(
    html,
    /data-builder-style-size="display"/,
    "size:xl must not emit display",
  );
});
