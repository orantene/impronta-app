/**
 * page-shape.ts — compose a fidelity design the way a PUBLIC ROUTE does, so the
 * perf budget can measure the renderer CSS a VISITOR actually downloads.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * `perf-budget.ts` renders ONE builder tree and measures ONE renderer sheet.
 * That is faithful to what it renders, but a published page is not one tree. A
 * public route composes three independently-rendered trees, and each one mounts
 * its own `<BuilderNodeRendererStyles>`:
 *
 *   PublicHeader  → PublishedShellHeader  (src/components/public-header.tsx)
 *   page body     → the route's own BuilderNodeRendererStyles
 *   PublicFooter  → PublishedShellFooter  (src/components/public-footer.tsx)
 *
 * Measured on production 2026-09-01 (before the REND-2 scoping fixes landed):
 * shell header 100.0 KB + page body 87.0 KB + shell footer 87.8 KB = 274.8 KB
 * per page — three times what `rendererCssScopedBytes` polices.
 *
 * There is NO de-dup mechanism in the renderer (see `BuilderNodeRendererStyles`
 * in builder-node/render.tsx — no module Set, no React.cache, no context). The
 * "exactly one sheet" invariant is a per-TREE caller convention, not a per-page
 * guarantee, and the three call sites above are three separate callers.
 *
 * ── What this module does ────────────────────────────────────────────────────
 * It builds that three-tree composition offline and deterministically, then
 * REPORTS the sheets it observes in the rendered HTML — it does not assume three
 * or assume their size. Both numbers come out of the same `<style
 * data-builder-node-renderer-styles>` regex the single-tree measurement uses, so
 * a change in either direction shows up as a measurement, not as an assertion.
 *
 * ── The shell fixture, and why it is trustworthy ─────────────────────────────
 * The shell trees come from `SHELL_VARIANT_SEEDS` — the six shipped shell
 * templates every new workspace picks from (builder-core/templates). They are
 * pure TypeScript, need no tenant, no DB and no network, and `buildShellVariantTree`
 * resets the id counter so the trees are byte-stable across runs.
 *
 * We deliberately compose the HEAVIEST shipped header with the HEAVIEST shipped
 * footer, chosen by measurement at run time rather than hardcoded by slug. That
 * makes the page metric a worst-case envelope over the shell catalogue, and it
 * means a new variant that costs a visitor more raises the measured number
 * automatically instead of hiding behind a stale pick.
 *
 * Cross-checked against the real thing (2026-09-02, this branch, tsx probe over
 * `scripts/impronta-rebuild/shell/seed-shell.ts#treesForLocale("en")` — the
 * exact trees behind the live improntamodels.com shell):
 *
 *   improntamodels.com production shell, scoped:  header 63.5 KB · footer 53.0 KB
 *   heaviest shipped variant, scoped:             header 61.9 KB · footer 53.2 KB
 *
 * i.e. the repo-owned fixture is within ~2.5% of the production shell on the
 * header and within ~0.4% on the footer. The fixture is used rather than the
 * Impronta trees on purpose: `scripts/impronta-rebuild/**` is one tenant's
 * rebuild script and is actively edited, and a CI budget must not move because
 * somebody re-worded a nav item.
 *
 * SCOPE: renderer CSS only. Fonts, images, HTML bytes and DOM nodes stay
 * single-tree metrics in perf-budget.ts — composing them would change what every
 * historical number in that file means, which is exactly the mistake this module
 * exists to avoid.
 */

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BuilderNodeRendererStyles,
  renderBuilderNodes,
  type BuilderNodeRenderDataSources,
} from "../../src/lib/site-admin/builder-node/render";
import { collectPresentNodeKinds } from "../../src/lib/site-admin/builder-node/renderer-css-scope";
import type { BuilderNode } from "../../src/lib/site-admin/builder-node/types";
import {
  SHELL_VARIANT_SEEDS,
  buildShellVariantTree,
} from "../../src/lib/site-admin/builder-core/templates/shell-variant-seeds";

/** Same pattern perf-budget.ts uses, kept local so the two cannot drift apart. */
const RENDERER_STYLE_RE =
  /<style\b[^>]*\bdata-builder-node-renderer-styles\b[^>]*>([\s\S]*?)<\/style>/g;

export type PageShapeSlot = "shell_header" | "page_body" | "shell_footer";

export interface PageShapeSheet {
  /** Which of the three composed trees emitted this sheet. */
  slot: PageShapeSlot;
  /** Byte size of the sheet's CSS text (uncompressed, as served). */
  bytes: number;
}

export interface PageShapeMeasurement {
  /** Every `<style data-builder-node-renderer-styles>` block, in document order. */
  sheets: PageShapeSheet[];
  /** `sheets.length` — OBSERVED, never assumed. */
  sheetCount: number;
  /** Sum of every sheet's bytes: the renderer CSS one visitor downloads. */
  totalBytes: number;
  /** Slug of the shell header variant used, for the report. */
  headerVariantSlug: string;
  /** Slug of the shell footer variant used, for the report. */
  footerVariantSlug: string;
}

/**
 * One composed side. Mirrors the real call shape: the tree is rendered with
 * `includeRendererStyles: false` and the sheet is mounted separately with
 * `kinds` + `nodes`, exactly as PublishedShell.tsx and the page routes do.
 * (`includeFontLinks: false` because this module measures CSS only.)
 */
function renderSlot(
  tree: ReadonlyArray<BuilderNode>,
  dataSources?: BuilderNodeRenderDataSources,
): ReturnType<typeof createElement> {
  return createElement(
    Fragment,
    null,
    createElement(BuilderNodeRendererStyles, {
      kinds: collectPresentNodeKinds(tree),
      nodes: tree,
    }),
    renderBuilderNodes(tree, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }),
  );
}

interface ShellFixture {
  slug: string;
  tree: BuilderNode[];
  /** Scoped sheet bytes, used only to pick the heaviest variant. */
  sheetBytes: number;
}

function sheetBytesFor(tree: ReadonlyArray<BuilderNode>): number {
  const html = renderToStaticMarkup(renderSlot(tree));
  const match = [...html.matchAll(RENDERER_STYLE_RE)][0];
  return match ? Buffer.byteLength(match[1], "utf8") : 0;
}

let cachedShell: { header: ShellFixture; footer: ShellFixture } | null = null;

/**
 * The heaviest shipped header + heaviest shipped footer, by measured scoped
 * sheet size. Computed once per process (the trees are deterministic, so the
 * pick is too) and reused across every design.
 */
export function heaviestShellFixture(): { header: ShellFixture; footer: ShellFixture } {
  if (cachedShell) return cachedShell;
  let header: ShellFixture | null = null;
  let footer: ShellFixture | null = null;
  for (const seed of SHELL_VARIANT_SEEDS) {
    const tree = buildShellVariantTree(seed);
    const candidate: ShellFixture = { slug: seed.slug, tree, sheetBytes: sheetBytesFor(tree) };
    if (seed.kind === "shell_header") {
      if (!header || candidate.sheetBytes > header.sheetBytes) header = candidate;
    } else if (!footer || candidate.sheetBytes > footer.sheetBytes) {
      footer = candidate;
    }
  }
  if (!header || !footer) {
    throw new Error(
      "SHELL_VARIANT_SEEDS no longer contains both a shell_header and a shell_footer — " +
        "the page-shaped budget cannot compose a page without both.",
    );
  }
  cachedShell = { header, footer };
  return cachedShell;
}

/**
 * Compose `bodyTree` into shell header + body + shell footer and measure the
 * renderer sheets the composition emits.
 */
export function measurePageShape(
  bodyTree: ReadonlyArray<BuilderNode>,
  dataSources?: BuilderNodeRenderDataSources,
): PageShapeMeasurement {
  const shell = heaviestShellFixture();
  const slots: Array<{ slot: PageShapeSlot; tree: ReadonlyArray<BuilderNode> }> = [
    { slot: "shell_header", tree: shell.header.tree },
    { slot: "page_body", tree: bodyTree },
    { slot: "shell_footer", tree: shell.footer.tree },
  ];

  // Render each slot separately and concatenate, which is what the route tree
  // does: three sibling server components, each producing its own subtree. The
  // sheets are then re-extracted from the concatenated document so the count is
  // observed from real output rather than inferred from the loop.
  const html = slots
    .map(({ tree }) => renderToStaticMarkup(renderSlot(tree, tree === bodyTree ? dataSources : undefined)))
    .join("\n");

  const blocks = [...html.matchAll(RENDERER_STYLE_RE)];
  // Attribute each observed sheet to a slot by document order. If a slot ever
  // emits zero or two sheets the attribution degrades, which is precisely the
  // regression `pageRendererCssSheets` is there to catch — so we label what we
  // can and let the count speak.
  const sheets: PageShapeSheet[] = blocks.map((block, index) => ({
    slot: slots[index]?.slot ?? "page_body",
    bytes: Buffer.byteLength(block[1], "utf8"),
  }));

  return {
    sheets,
    sheetCount: sheets.length,
    totalBytes: sheets.reduce((sum, sheet) => sum + sheet.bytes, 0),
    headerVariantSlug: shell.header.slug,
    footerVariantSlug: shell.footer.slug,
  };
}
