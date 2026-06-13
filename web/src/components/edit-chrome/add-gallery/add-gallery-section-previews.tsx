"use client";

import { cloneElement, isValidElement, memo } from "react";

import { getAddGalleryItemById } from "@/lib/site-admin/add-gallery";
import { buildAddGallerySectionTemplate } from "@/lib/site-admin/add-gallery/section-templates";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

// ── SVG wireframe constants ──────────────────────────────────────────────────

/** Viewbox dimensions for all section preview SVGs. */
const VW = 160;
const VH = 72;

/** Common accent color — indigo, matches the CHROME.accent token. */
const ACCENT_FG = "#7c3aed";

/** Base wire stroke props */
const WIRE_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// ── Layout helpers ────────────────────────────────────────────────────────────

/**
 * A "slot" is a positioned rectangle in the SVG viewbox.
 * The tree walker breaks the VW×VH space into slots for each node.
 */
interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ROOT_SLOT: Slot = { x: 6, y: 6, w: VW - 12, h: VH - 12 };

/** Shrink a slot inward by padding on each side. */
function pad(s: Slot, px: number): Slot {
  return { x: s.x + px, y: s.y + px, w: s.w - px * 2, h: s.h - px * 2 };
}

/** Split a slot into N equal horizontal slices, with a small gap. */
function splitH(s: Slot, n: number, gap = 4): Slot[] {
  const usable = s.w - gap * (n - 1);
  const w = Math.max(1, usable / n);
  return Array.from({ length: n }, (_, i) => ({
    x: s.x + i * (w + gap),
    y: s.y,
    w,
    h: s.h,
  }));
}

/** Split a slot into N equal vertical slices (rows), with a small gap. */
function splitV(s: Slot, n: number, gap = 3): Slot[] {
  const usable = s.h - gap * (n - 1);
  const h = Math.max(1, usable / n);
  return Array.from({ length: n }, (_, i) => ({
    x: s.x,
    y: s.y + i * (h + gap),
    w: s.w,
    h,
  }));
}

// ── SVG element emitters per node kind ───────────────────────────────────────

/**
 * Recursively walk a BuilderNode tree and emit SVG wireframe elements.
 * The slot is the space this node should occupy in the 160×72 viewbox.
 * `nodePath` is a unique positional prefix (e.g. "0-1-2") that scopes every
 * emitted key so siblings from different branches never collide.
 * Returns an array of SVG element descriptors (rendered lazily).
 */
function walk(
  node: BuilderNode,
  slot: Slot,
  depth = 0,
  nodePath = "r",
): React.ReactNode[] {
  const { kind } = node;
  // Use the node's own id when available for extra stability; fall back to the
  // positional path, which is always unique within a single walk invocation.
  const p = (node as { id?: string }).id ?? nodePath;
  const children =
    "children" in node && Array.isArray(node.children) ? node.children : [];

  // Depth cap — anything past depth 6 just renders a faint placeholder
  if (depth > 6) return [];

  // ── Leaf-level semantic nodes ────────────────────────────────────────────
  if (kind === "heading") {
    // Bold horizontal bar — thicker for level 1, thinner for 2+
    const level = (node.props as { level?: number }).level ?? 2;
    const barH = level === 1 ? 2 : 1.5;
    const barW = level === 1 ? slot.w * 0.75 : slot.w * 0.6;
    const barX = slot.x + (slot.w - barW) / 2;
    const barY = slot.y + slot.h / 2 - barH / 2;
    return [
      <rect
        key={`${p}-heading`}
        x={barX}
        y={barY}
        width={barW}
        height={barH}
        rx={0.5}
        fill="currentColor"
        opacity={level === 1 ? 0.75 : 0.6}
      />,
    ];
  }

  if (kind === "paragraph") {
    // One or two thin lines to suggest body copy
    const lineH = 1;
    const maxLines = slot.h > 8 ? 2 : 1;
    const lines = Array.from({ length: maxLines }, (_, i) => {
      const lineW = i === 0 ? slot.w * 0.85 : slot.w * 0.65;
      const lineX = slot.x + (slot.w - lineW) / 2;
      const lineY =
        maxLines === 1
          ? slot.y + slot.h / 2 - lineH / 2
          : slot.y + slot.h / 2 - 2.5 + i * 4;
      return (
        <rect
          key={`${p}-para-${i}`}
          x={lineX}
          y={lineY}
          width={lineW}
          height={lineH}
          rx={0.5}
          fill="currentColor"
          opacity={0.35}
        />
      );
    });
    return lines;
  }

  if (kind === "button") {
    // Rounded pill shape
    const pillH = Math.min(8, slot.h * 0.6);
    const pillW = Math.min(slot.w, 28);
    const pillX = slot.x + (slot.w - pillW) / 2;
    const pillY = slot.y + (slot.h - pillH) / 2;
    return [
      <rect
        key={`${p}-button`}
        x={pillX}
        y={pillY}
        width={pillW}
        height={pillH}
        rx={pillH / 2}
        fill="currentColor"
        opacity={0.55}
      />,
    ];
  }

  if (kind === "cta_group") {
    // Row of two pill buttons
    const slots = splitH(slot, Math.min(children.length || 2, 3), 4);
    return slots.flatMap((s, i) => {
      const c = children[i];
      return c
        ? walk(c, s, depth + 1, `${p}-${i}`)
        : walkButton(s, `${p}-fb-${i}`);
    });
  }

  if (kind === "image") {
    // Filled rect with a subtle diagonal — indicates image placeholder
    return [
      <rect
        key={`${p}-img`}
        x={slot.x}
        y={slot.y}
        width={slot.w}
        height={slot.h}
        rx={3}
        fill="currentColor"
        opacity={0.18}
      />,
      <line
        key={`${p}-img-diag`}
        x1={slot.x}
        y1={slot.y + slot.h}
        x2={slot.x + slot.w}
        y2={slot.y}
        stroke="currentColor"
        strokeWidth={0.75}
        opacity={0.12}
      />,
    ];
  }

  if (kind === "masonry") {
    // 3-column grid of image rects
    const cols = (node.props as { columns?: number }).columns ?? 3;
    const count = Math.max(cols, children.length || cols);
    const slotCols = splitH(slot, Math.min(count, 4), 3);
    return slotCols.map((s, i) => (
      <rect
        key={`${p}-masonry-${i}`}
        x={s.x}
        y={s.y}
        width={s.w}
        height={s.h}
        rx={2}
        fill="currentColor"
        opacity={0.22}
      />
    ));
  }

  if (kind === "section_embed") {
    // Special "connected data" slot — filled rect with a subtle grid pattern
    return [
      <rect
        key={`${p}-embed-bg`}
        x={slot.x}
        y={slot.y}
        width={slot.w}
        height={slot.h}
        rx={3}
        fill="currentColor"
        opacity={0.08}
      />,
      // 3 columns of placeholder "cards"
      ...splitH(pad(slot, 3), 3, 3).map((s, i) => (
        <rect
          key={`${p}-embed-col-${i}`}
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          rx={2}
          fill="currentColor"
          opacity={0.18}
        />
      )),
    ];
  }

  if (kind === "card") {
    // Bordered box with a brief interior line
    const elems: React.ReactNode[] = [
      <rect
        key={`${p}-card-bg`}
        x={slot.x}
        y={slot.y}
        width={slot.w}
        height={slot.h}
        rx={3}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.75}
        opacity={0.35}
      />,
    ];
    if (children.length > 0) {
      // Stack children inside the card
      const inner = pad(slot, 3);
      const childSlots = splitV(inner, Math.min(children.length, 3), 2);
      childSlots.forEach((s, i) => {
        if (children[i]) {
          elems.push(...walk(children[i], s, depth + 1, `${p}-${i}`));
        }
      });
    } else {
      // Default: a single thin interior line
      const lineY = slot.y + slot.h / 2;
      elems.push(
        <line
          key={`${p}-card-line`}
          x1={slot.x + 4}
          y1={lineY}
          x2={slot.x + slot.w - 4}
          y2={lineY}
          stroke="currentColor"
          strokeWidth={1}
          opacity={0.3}
        />,
      );
    }
    return elems;
  }

  if (kind === "accordion" || kind === "accordion_item") {
    // Stack of horizontal bars (collapsed rows)
    const rowCount = kind === "accordion" ? Math.min(children.length || 3, 4) : 1;
    const rows = splitV(slot, rowCount, 2);
    return rows.map((row, i) => (
      <rect
        key={`${p}-acc-${i}`}
        x={row.x}
        y={row.y}
        width={row.w}
        height={Math.max(row.h, 5)}
        rx={2}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.75}
        opacity={0.35}
      />
    ));
  }

  if (kind === "form") {
    // Stack of 3 input field rects + a submit button
    const rows = splitV(slot, 3, 3);
    const elems: React.ReactNode[] = rows.map((row, i) => (
      <rect
        key={`${p}-field-${i}`}
        x={row.x}
        y={row.y}
        width={row.w}
        height={Math.max(row.h - 1, 4)}
        rx={2}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.75}
        opacity={i < 2 ? 0.3 : 0.5}
      />
    ));
    return elems;
  }

  // ── Container / structural nodes ─────────────────────────────────────────
  if (kind === "split") {
    // Left content + right image
    const [leftSlot, rightSlot] = splitH(slot, 2, 6);
    const leftChildren =
      "children" in node && Array.isArray(node.children) ? node.children[0] : null;
    const rightChildren =
      "children" in node && Array.isArray(node.children) ? node.children[1] : null;

    const leftElems = leftChildren
      ? walk(leftChildren, leftSlot, depth + 1, `${p}-0`)
      : walkTextBlock(leftSlot, `${p}-tb`);
    const rightElems = rightChildren
      ? walk(rightChildren, rightSlot, depth + 1, `${p}-1`)
      : [
          <rect
            key={`${p}-split-img`}
            x={rightSlot.x}
            y={rightSlot.y}
            width={rightSlot.w}
            height={rightSlot.h}
            rx={3}
            fill="currentColor"
            opacity={0.18}
          />,
        ];

    return [...leftElems, ...rightElems];
  }

  if (kind === "container") {
    if (children.length === 0) {
      return [
        <rect
          key={`${p}-empty-container`}
          x={slot.x}
          y={slot.y}
          width={slot.w}
          height={slot.h}
          rx={2}
          fill="currentColor"
          opacity={0.06}
        />,
      ];
    }

    const layout = (node.props as { layout?: string }).layout ?? "stack";

    if (layout === "row") {
      const childSlots = splitH(slot, Math.min(children.length, 5), 4);
      return children
        .slice(0, 5)
        .flatMap((child, i) =>
          childSlots[i] ? walk(child, childSlots[i], depth + 1, `${p}-${i}`) : [],
        );
    }

    if (layout === "grid") {
      const columns = Math.min((node.props as { columns?: number }).columns ?? 3, 4);
      const visibleChildren = children.slice(0, columns * 2);
      const rowCount = Math.ceil(visibleChildren.length / columns);
      const rowSlots = splitV(slot, rowCount, 3);
      return rowSlots.flatMap((rowSlot, ri) => {
        const rowChildren = visibleChildren.slice(ri * columns, (ri + 1) * columns);
        const colSlots = splitH(rowSlot, columns, 3);
        return rowChildren.flatMap((child, ci) =>
          colSlots[ci] ? walk(child, colSlots[ci], depth + 1, `${p}-${ri}-${ci}`) : [],
        );
      });
    }

    // stack layout (default)
    const visibleChildren = children.slice(0, 5);
    const childSlots = distributeVertically(slot, visibleChildren, depth);
    return visibleChildren.flatMap((child, i) =>
      childSlots[i] ? walk(child, childSlots[i], depth + 1, `${p}-${i}`) : [],
    );
  }

  // Fallback — tiny placeholder rect
  return [
    <rect
      key={`${p}-fallback-${kind}`}
      x={slot.x}
      y={slot.y}
      width={slot.w}
      height={Math.max(slot.h, 3)}
      rx={1}
      fill="currentColor"
      opacity={0.1}
    />,
  ];
}

/**
 * Distribute a slot's vertical space among children.
 * Headings, paragraphs, and buttons get proportional heights.
 * Containers, grids, and images get more space.
 */
function distributeVertically(slot: Slot, children: BuilderNode[], depth: number): Slot[] {
  const weights = children.map((child) => {
    const k = child.kind;
    if (k === "heading") return depth <= 1 ? 1.5 : 1;
    if (k === "paragraph") return 1;
    if (k === "button") return 0.8;
    if (k === "cta_group") return 1;
    if (k === "image") return 3;
    if (k === "masonry") return 3;
    if (k === "section_embed") return 3.5;
    if (k === "container") {
      const layout = (child.props as { layout?: string }).layout ?? "stack";
      return layout === "grid" ? 3 : 2;
    }
    if (k === "split") return 4;
    if (k === "card") return 2;
    if (k === "accordion") return 3;
    if (k === "form") return 3;
    return 1.5;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const gap = 3;
  const usableH = slot.h - gap * (children.length - 1);

  let y = slot.y;
  return children.map((_, i) => {
    const h = Math.max((weights[i] / totalWeight) * usableH, 4);
    const s: Slot = { x: slot.x, y, w: slot.w, h };
    y += h + gap;
    return s;
  });
}

/** Fallback: render a generic "text block" (title + 2 body lines) in a slot. */
function walkTextBlock(slot: Slot, pathPrefix = "tb"): React.ReactNode[] {
  const rows = splitV(slot, 3, 3);
  return [
    <rect
      key={`${pathPrefix}-title`}
      x={rows[0].x + rows[0].w * 0.1}
      y={rows[0].y + rows[0].h / 2 - 0.75}
      width={rows[0].w * 0.7}
      height={1.5}
      rx={0.5}
      fill="currentColor"
      opacity={0.55}
    />,
    <rect
      key={`${pathPrefix}-p1`}
      x={rows[1].x}
      y={rows[1].y + rows[1].h / 2 - 0.5}
      width={rows[1].w * 0.85}
      height={1}
      rx={0.5}
      fill="currentColor"
      opacity={0.3}
    />,
    <rect
      key={`${pathPrefix}-p2`}
      x={rows[2].x}
      y={rows[2].y + rows[2].h / 2 - 0.5}
      width={rows[2].w * 0.65}
      height={1}
      rx={0.5}
      fill="currentColor"
      opacity={0.3}
    />,
  ];
}

/** Fallback: a single button pill in a slot. */
function walkButton(slot: Slot, pathPrefix = "btn-fb"): React.ReactNode[] {
  const pillH = Math.min(8, slot.h * 0.6);
  const pillW = Math.min(slot.w * 0.8, 28);
  return [
    <rect
      key={`${pathPrefix}`}
      x={slot.x + (slot.w - pillW) / 2}
      y={slot.y + (slot.h - pillH) / 2}
      width={pillW}
      height={pillH}
      rx={pillH / 2}
      fill="currentColor"
      opacity={0.5}
    />,
  ];
}

// ── Fallback icon for templates without a builder ────────────────────────────

function FallbackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={28}
      height={28}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="3" opacity={0.3} />
      <path d="M7 10h10M7 14h7" opacity={0.5} />
    </svg>
  );
}

// ── Core memoized wireframe renderer ─────────────────────────────────────────

/**
 * Renders a structural wireframe for a given sectionTemplateId.
 * Memoized so the same template doesn't re-render across panel pans.
 */
const TemplateWireframe = memo(function TemplateWireframe({
  templateId,
}: {
  templateId: string;
}) {
  const root = buildAddGallerySectionTemplate(templateId);

  if (!root) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <FallbackIcon />
      </div>
    );
  }

  // walk() returns a flat element list whose per-node keys (e.g. "para-0",
  // "button") are only unique within a single node — sibling nodes of the same
  // kind collide once flattened. Re-key by position so the SVG's direct children
  // are always unique (fixes React "two children with the same key" warnings for
  // every section/template preview, including DB-template fallbacks).
  const elements = walk(root, ROOT_SLOT, 0).map((el, i) =>
    isValidElement(el) ? cloneElement(el, { key: `w-${i}` }) : el,
  );

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="h-full w-full"
      aria-hidden
      {...WIRE_STROKE}
    >
      {elements}
    </svg>
  );
});

// ── Public component ──────────────────────────────────────────────────────────

/**
 * Section preview rendered from the section's builder template tree.
 *
 * The preview is a monochrome SVG wireframe that reflects the section's
 * actual structure — headings become bold bars, paragraphs become thin lines,
 * buttons become pill shapes, images become filled rectangles, containers
 * arrange children in rows/stacks. This makes Hero vs Gallery vs CTA vs FAQ
 * distinguishable at a glance without any images or data fetching.
 */
export function AddGallerySectionPreview({
  itemId,
  templateId,
}: {
  itemId: string;
  /** Optional override — if supplied the template is looked up directly. */
  templateId?: string;
}) {
  // Prefer explicit templateId; otherwise look up via the item registry.
  const resolvedTemplateId =
    templateId ?? getAddGalleryItemById(itemId)?.sectionTemplateId ?? itemId;

  return (
    <div
      className="flex h-full w-full items-center justify-center px-[10px] py-[8px]"
      style={{ color: ACCENT_FG }}
    >
      <TemplateWireframe templateId={resolvedTemplateId} />
    </div>
  );
}
