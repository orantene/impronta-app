/**
 * Legacy ↔ freeform bridge for `workspace_pages.blocks` (Gap 2).
 *
 * THE PROBLEM
 * -----------
 * `workspace_pages.blocks` is a single JSONB column that historically held a
 * legacy `PageBlock[]` (objects with a `type` in
 * `"hero"|"text"|"image"|"gallery"|"roster"|"cta"`), rendered publicly by
 * `BlocksRenderer` (`components/page-builder/blocks`). WS6's freeform Page
 * Builder writes an INCOMPATIBLE `BuilderNode[]` (objects with a `kind` in the
 * BuilderNode discriminated union) to the SAME column.
 *
 * Because the two shapes share one column, the public renderer AND the editor
 * must each detect which shape a given row holds and route accordingly. A naive
 * swap that always assumed `BuilderNode[]` would break every existing published
 * legacy page.
 *
 * This module is the ONE place that:
 *   1. discriminates the two shapes (`isFreeformBlocks`), and
 *   2. converts legacy `PageBlock[]` → `BuilderNode[]` for convert-on-open in
 *      the freeform editor (`convertLegacyPageBlocksToBuilderNodes`).
 *
 * It is intentionally dependency-light — `import type` only from the two shape
 * modules, plus `crypto.randomUUID` for ids — so it can be unit-tested under a
 * bare `node:test` run with NO server / CSS import chain.
 */

import type {
  BuilderNode,
  BuilderNodeKind,
} from "./types";
import type { PageBlock } from "@/components/page-builder/blocks/types";

/**
 * The legacy `PageBlock["type"]` enum, as a runtime set. Mirrors
 * `components/page-builder/blocks/types.ts` exactly. Kept as a literal set (not
 * derived from the type) so the discriminator stays a pure value check.
 */
const LEGACY_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "hero",
  "text",
  "image",
  "gallery",
  "roster",
  "cta",
]);

/**
 * The freeform `BuilderNodeKind` enum, as a runtime set. Mirrors
 * `BuilderNodeKind` in `./types`. The two enums are DISJOINT — no string is in
 * both — which is what makes the shapes reliably distinguishable.
 */
const BUILDER_NODE_KINDS: ReadonlySet<string> = new Set<BuilderNodeKind>([
  "section",
  "container",
  "split",
  "accordion",
  "accordion_item",
  "tabs",
  "tab_panel",
  "carousel",
  "masonry",
  "heading",
  "paragraph",
  "button",
  "image",
  "video",
  "embed",
  "icon",
  "pricing_table",
  "rich_text",
  "code",
  "divider",
  "spacer",
  "card",
  "cta_group",
  "nav",
  "form",
  "section_embed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Discriminate the stored `workspace_pages.blocks` value.
 *
 * Returns `true` when the value is a FREEFORM `BuilderNode[]`, `false` when it
 * is (or should be treated as) a LEGACY `PageBlock[]` that must keep rendering
 * through `BlocksRenderer`.
 *
 * Distinguishing fields (the two enums are disjoint, so either one decides it):
 *   - every `BuilderNode` carries `kind` ∈ {@link BUILDER_NODE_KINDS} + an `id`.
 *   - every legacy `PageBlock` carries `type` ∈ {@link LEGACY_BLOCK_TYPES} and
 *     NO `kind`.
 *
 * Robustness rules:
 *   - Non-array / empty array → `false` (NOT freeform). An empty `[]` is the
 *     ambiguous default both editors write; routing it to the legacy renderer
 *     (which renders nothing for `[]`) is byte-safe, and the freeform editor
 *     opens an empty tree the same way regardless.
 *   - A row is freeform only when EVERY entry is a freeform node AND NONE is a
 *     legacy block. A single legacy entry (or a single missing-`kind` entry)
 *     forces the legacy path so we never feed half-legacy data to the freeform
 *     renderer.
 *   - First entry decides the fast path; the all-entries check is the guard.
 */
export function isFreeformBlocks(blocks: unknown): boolean {
  if (!Array.isArray(blocks) || blocks.length === 0) return false;

  let sawFreeform = false;
  for (const entry of blocks) {
    if (!isRecord(entry)) return false;

    const kind = entry["kind"];
    const type = entry["type"];

    // A legacy block (has a legacy `type`, no freeform `kind`) anywhere forces
    // the legacy path.
    if (
      typeof type === "string" &&
      LEGACY_BLOCK_TYPES.has(type) &&
      typeof kind !== "string"
    ) {
      return false;
    }

    // A valid freeform node: `kind` in the builder enum + a string `id`.
    if (
      typeof kind === "string" &&
      BUILDER_NODE_KINDS.has(kind) &&
      typeof entry["id"] === "string"
    ) {
      sawFreeform = true;
      continue;
    }

    // Anything that is neither a recognizable freeform node nor a legacy block
    // (corrupt / partial) → default to the legacy renderer, which degrades
    // gracefully (unknown blocks render nothing) rather than risk the freeform
    // renderer choking on a malformed node.
    return false;
  }

  return sawFreeform;
}

// ── Legacy → freeform conversion (convert-on-open) ───────────────────────────

/** Local id factory — mirrors `makeId(kind)` in `./create` without importing it
 *  (keeps this module's import graph free of `section-embed-presets`). */
function nodeId(kind: BuilderNodeKind): string {
  return `builder-${kind}-${crypto.randomUUID()}`;
}

/**
 * Very small inline-markdown stripper for legacy text bodies. The legacy text
 * block stored "plain text / basic markdown"; the freeform paragraph renders
 * its `text` as plain text. We strip the most common `**bold**`/`*italic*`
 * markers so the converted copy reads cleanly. (Lossy by design — convert-on-
 * open is a starting point an operator then refines; the published legacy
 * output is untouched until they re-save.)
 */
function stripBasicMarkdown(input: string): string {
  // `[\s\S]` instead of `.` + the `s` (dotAll) flag — the latter requires an
  // es2018+ target this tsconfig does not set.
  return input
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/\*([\s\S]+?)\*/g, "$1");
}

/**
 * Convert a LEGACY `PageBlock[]` to a freeform `BuilderNode[]` so a legacy page
 * can be OPENED in the freeform editor without the editor choking on the
 * foreign shape.
 *
 * ROOT-VALIDITY: the freeform `builderTree` root only accepts LAYOUT kinds
 * (`section`/`container`/`card`/`masonry`/`section_embed`/… — see
 * `ROOT_ALLOWED_KINDS` in drop-policy.ts), never bare `heading`/`paragraph`/
 * `image`. So EVERY converted block is emitted as a root-valid node: composite
 * blocks become a `container`, the gallery a `masonry`, the roster a
 * `section_embed`, and the bare text/image blocks are wrapped in a single-child
 * `container` so the resulting tree passes `validateBuilderNodeTree`. (A
 * `section` node is NOT used — `render.tsx` returns null for `kind:"section"`
 * in the freeform path; that wrapper is only meaningful in the curated
 * snapshot path.)
 *
 * Mapping (each legacy block → one root-valid node, order preserved):
 *   - hero    → `container` (stack) → heading (+ optional paragraph, image, CTA
 *               button).
 *   - text    → `container` (stack) → paragraph (basic markdown markers stripped).
 *   - image   → `container` (stack) → image.
 *   - gallery → `masonry` of `image` children (empty galleries → an empty
 *               masonry the operator can fill).
 *   - roster  → `section_embed` keyed to the curated `featured_talent` section
 *               (the freeform equivalent of the legacy roster grid). Its
 *               `config` is all-optional + defaulted, so it parses to a valid
 *               live section; if anything ever fails it degrades to a labeled
 *               placeholder (never blanks the page).
 *   - cta     → `container` (stack) → heading (+ optional body paragraph) + CTA
 *               button.
 *
 * IMPORTANT — this is for editor convert-on-open ONLY. The published page keeps
 * rendering its legacy blocks via `BlocksRenderer` until the operator saves the
 * converted tree back (at which point the row becomes freeform and the
 * shape-aware public renderer routes it to `renderBuilderNodes`). No data loss:
 * the original legacy blocks remain on the row until that explicit re-save.
 */
export function convertLegacyPageBlocksToBuilderNodes(
  blocks: ReadonlyArray<PageBlock>,
): BuilderNode[] {
  const nodes: BuilderNode[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "hero": {
        const children: BuilderNode[] = [
          {
            id: nodeId("heading"),
            kind: "heading",
            props: { text: block.heading ?? "", level: 1 },
          },
        ];
        if (block.subheading && block.subheading.trim() !== "") {
          children.push({
            id: nodeId("paragraph"),
            kind: "paragraph",
            props: { text: block.subheading },
          });
        }
        if (block.imageUrl && block.imageUrl.trim() !== "") {
          children.push({
            id: nodeId("image"),
            kind: "image",
            props: { src: block.imageUrl, alt: block.heading ?? "" },
          });
        }
        if (block.ctaLabel && block.ctaLabel.trim() !== "") {
          children.push({
            id: nodeId("button"),
            kind: "button",
            props: {
              label: block.ctaLabel,
              href: block.ctaHref ?? "/",
              tone: "primary",
            },
          });
        }
        nodes.push({
          id: nodeId("container"),
          kind: "container",
          props: { layout: "stack", gap: "m", layerLabel: "Hero" },
          children,
        });
        break;
      }

      case "text": {
        nodes.push({
          id: nodeId("container"),
          kind: "container",
          props: { layout: "stack", gap: "m", layerLabel: "Text" },
          children: [
            {
              id: nodeId("paragraph"),
              kind: "paragraph",
              props: { text: stripBasicMarkdown(block.content ?? "") },
            },
          ],
        });
        break;
      }

      case "image": {
        nodes.push({
          id: nodeId("container"),
          kind: "container",
          props: { layout: "stack", gap: "m", layerLabel: "Image" },
          children: [
            {
              id: nodeId("image"),
              kind: "image",
              props: {
                src: block.url ?? "",
                alt: block.alt ?? "",
              },
            },
          ],
        });
        break;
      }

      case "gallery": {
        const children: BuilderNode[] = (block.images ?? []).map((img) => ({
          id: nodeId("image"),
          kind: "image" as const,
          props: { src: img.url ?? "", alt: img.alt ?? "" },
        }));
        nodes.push({
          id: nodeId("masonry"),
          kind: "masonry",
          props: { columns: 3, gap: "m", layerLabel: "Gallery" },
          children,
        });
        break;
      }

      case "roster": {
        const config: Record<string, unknown> = {};
        if (block.heading && block.heading.trim() !== "") {
          config.headline = block.heading;
        }
        if (typeof block.maxItems === "number") {
          // featured_talent.limit is clamped to 1..15 by its schema.
          config.limit = Math.min(15, Math.max(1, Math.round(block.maxItems)));
        }
        nodes.push({
          id: nodeId("section_embed"),
          kind: "section_embed",
          props: {
            sectionTypeKey: "featured_talent",
            layerLabel: "Roster",
            config,
          },
        });
        break;
      }

      case "cta": {
        const children: BuilderNode[] = [
          {
            id: nodeId("heading"),
            kind: "heading",
            props: { text: block.heading ?? "", level: 2 },
          },
        ];
        if (block.body && block.body.trim() !== "") {
          children.push({
            id: nodeId("paragraph"),
            kind: "paragraph",
            props: { text: block.body },
          });
        }
        children.push({
          id: nodeId("button"),
          kind: "button",
          props: {
            label: block.buttonLabel ?? "Get in touch",
            href: block.buttonHref ?? "/",
            tone: "primary",
          },
        });
        nodes.push({
          id: nodeId("container"),
          kind: "container",
          props: { layout: "stack", gap: "m", layerLabel: "Call to action" },
          children,
        });
        break;
      }

      default: {
        // Exhaustiveness guard — a new legacy block type would surface here in
        // tsc. Unknown blocks are skipped (never throw) so conversion is safe.
        break;
      }
    }
  }

  return nodes;
}
