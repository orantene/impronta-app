/**
 * Print surface adapter (Piece B slice 1, Path A).
 *
 * The `print` BuilderSurfaceKind persists a freeform builder tree at a fixed
 * physical size to the `print_designs` table (migration 20261229000800). It is
 * the thinnest real adapter: load/save/saveDraft only. `publish` for a print
 * design is EXPORT TO A PDF — that is Piece B slice 2 (`toPrintPdfDesign`), so
 * this adapter's publish returns a clear not-yet result and the mount sets
 * `canPublish: false`. No revisions in v1 (`canRestoreRevision: false`), so no
 * `restoreRevision`/`loadRevisions` — a print card is a small artefact, not a
 * versioned page.
 *
 * Mirrors `site-shell-adapter-core.ts` (the other freeform, single-row surface),
 * but keys version on an explicit `print_designs.version` OCC column rather than
 * `updated_at`, and never touches `cms_pages` (a print design must never render
 * as a site page or appear in a page list). Style registries are not persisted
 * in v1 — `print_designs` carries only name/size/builder_tree/version — so the
 * per-design style-class registry loads empty; per-node styles ride the tree.
 */

import type {
  CompositionData,
  CompositionLoadResult,
  CompositionSaveInput,
  CompositionSaveResult,
  SaveDraftResult,
  PublishResult,
} from "@/lib/site-admin/edit-mode/composition-actions";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
// The PURE size table — NOT `qr/files` (that is `import "server-only"` for the
// PDF renderer). buildPrintComposition runs client-side via the bound adapter,
// so it must not pull server-only code into the client bundle.
import { PRINT_SIZES, type PrintSizeKey } from "@/lib/links/qr/print-sizes";

/**
 * Bleed — 3 mm of artwork past the trim line so a guillotine 1 mm off-centre
 * leaves no white sliver. A property of the PAGE, not the QR symbol (that's the
 * quiet zone, which lives inside `qr.sizeMm`). Ruled model (2) in
 * print-canvas-design.md: the canvas IS bleed-size and a trim guide sits on top.
 */
const PRINT_BLEED_MM = 3;

/** Map a stored `print_designs.size` string to its fixed mm artboard, bleed
 *  included. Unknown/legacy values fall back to `table_tent` (never throws). */
function printArtboardForSize(size: string): {
  widthMm: number;
  heightMm: number;
  bleedMm: number;
} {
  const key: PrintSizeKey = size in PRINT_SIZES ? (size as PrintSizeKey) : "table_tent";
  const dims = PRINT_SIZES[key];
  return { widthMm: dims.widthMm, heightMm: dims.heightMm, bleedMm: PRINT_BLEED_MM };
}

import type {
  BuilderSurfaceAdapter,
  BuilderSurfaceContext,
  BuilderSurfacePublishInput,
  BuilderSurfaceSaveDraftInput,
} from "../surface-adapter";
import {
  coerceStyleClassRegistry,
  coerceStylePresetRegistry,
} from "@/lib/site-admin/builder-node/style-registry-coerce";

/** One `print_designs` row, as the adapter needs it. */
export interface PrintDesignRow {
  id: string;
  name: string;
  size: string;
  builder_tree: BuilderNodeTree | null;
  version: number;
}

/**
 * Result of a persist write. `version` is the row's NEW version after the write,
 * or an `ok:false` when the design changed under the caller (OCC) or is gone.
 */
export type PrintDesignSaveOutcome =
  | { ok: true; version: number }
  | { ok: false; error: string };

/**
 * The DB seam, injected so the adapter stays free of `server-only` and testable
 * with a spy. Production binds these to the real `print-actions.ts` server path.
 */
export interface PrintAdapterActions {
  loadPrintDesign(input: { pageId: string }): Promise<PrintDesignRow | null>;
  savePrintDesign(input: {
    pageId: string;
    builderTree: BuilderNodeTree;
    expectedVersion: number;
  }): Promise<PrintDesignSaveOutcome>;
}

/** Map a print_designs row to the editor's composition envelope. */
export function buildPrintComposition(
  row: PrintDesignRow,
  locale: string,
): CompositionData {
  const builderTree: BuilderNodeTree = Array.isArray(row.builder_tree)
    ? row.builder_tree
    : [];
  return {
    locale: locale as CompositionData["locale"],
    pageId: row.id,
    pageVersion: row.version,
    liveSitePublishedAt: null,
    metadata: {
      title: row.name,
      metaTitle: null,
      metaDescription: null,
      introTagline: null,
      ogTitle: null,
      ogDescription: null,
      ogImageUrl: null,
      canonicalUrl: null,
      noindex: true,
      // A print piece is not a public page (capabilities.seo === false); no
      // structured data.
      jsonLd: null,
    },
    slots: {},
    builderTree,
    slotDefs: [],
    library: [],
    // Style registries are not persisted for print in v1; load empty.
    styleClasses: coerceStyleClassRegistry(null),
    stylePresets: coerceStylePresetRegistry(null),
    availableLocales: [locale as CompositionData["locale"]],
    printArtboard: printArtboardForSize(row.size),
  };
}

export function createPrintAdapter(
  actions: PrintAdapterActions,
): BuilderSurfaceAdapter {
  async function persist(
    ctx: BuilderSurfaceContext,
    builderTree: BuilderNodeTree | undefined,
    expectedVersion: number,
  ): Promise<CompositionSaveResult> {
    if (!ctx.pageId) {
      return { ok: false, error: "No print design is open." };
    }
    const outcome = await actions.savePrintDesign({
      pageId: ctx.pageId,
      builderTree: builderTree ?? [],
      expectedVersion,
    });
    if (!outcome.ok) return { ok: false, error: outcome.error };
    return { ok: true, pageVersion: outcome.version };
  }

  return {
    kind: "print",

    async load(ctx: BuilderSurfaceContext): Promise<CompositionLoadResult> {
      if (!ctx.pageId) {
        return { ok: false, error: "No print design is open." };
      }
      const row = await actions.loadPrintDesign({ pageId: ctx.pageId });
      if (!row) {
        return { ok: false, error: "This print design no longer exists." };
      }
      return { ok: true, data: buildPrintComposition(row, ctx.locale) };
    },

    async save(
      ctx: BuilderSurfaceContext,
      input: CompositionSaveInput,
    ): Promise<CompositionSaveResult> {
      return persist(ctx, input.builderTree, input.expectedVersion);
    },

    async saveDraft(
      ctx: BuilderSurfaceContext,
      input: BuilderSurfaceSaveDraftInput,
    ): Promise<SaveDraftResult> {
      const result = await persist(ctx, input.builderTree, input.expectedVersion);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        pageVersion: result.pageVersion,
        savedAt: new Date().toISOString(),
      };
    },

    async publish(
      _ctx: BuilderSurfaceContext,
      _input: BuilderSurfacePublishInput,
    ): Promise<PublishResult> {
      // A print design "publishes" by exporting to a PDF (Piece B slice 2),
      // not by going live as a page. The mount sets canPublish:false; this
      // guards the path if ever called directly.
      return {
        ok: false,
        error: "A print design exports to a PDF; there is nothing to publish live.",
      };
    },
  };
}
