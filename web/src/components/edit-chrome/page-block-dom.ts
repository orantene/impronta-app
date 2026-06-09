/**
 * DOM helpers for root-level page block gaps — shared by canvas drag-drop and
 * the between-blocks "+" affordance. Blocks are marked with `data-cms-block` and
 * `data-block-index` (matches `builderTree` root index).
 */
import type { PageRootDropRow } from "@/lib/site-admin/builder-node/canvas-node-drop";

export interface PageBlockBoundary {
  y: number;
  insertIndex: number;
  left: number;
  width: number;
}

function readBlockIndex(el: HTMLElement): number {
  const raw = el.getAttribute("data-block-index");
  const parsed = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function collectPageBlockElements(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  const els = Array.from(
    document.querySelectorAll<HTMLElement>("[data-cms-block]"),
  );
  return els.sort((a, b) => {
    const delta = readBlockIndex(a) - readBlockIndex(b);
    if (delta !== 0) return delta;
    const pos = a.compareDocumentPosition(b);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

export function collectPageBlockBoundaries(): PageBlockBoundary[] {
  const els = collectPageBlockElements();
  if (els.length === 0) return [];
  const gaps: PageBlockBoundary[] = [];
  const firstRect = els[0]!.getBoundingClientRect();
  gaps.push({
    y: firstRect.top,
    insertIndex: 0,
    left: firstRect.left,
    width: firstRect.width,
  });
  for (let i = 0; i < els.length - 1; i += 1) {
    const aRect = els[i]!.getBoundingClientRect();
    const bRect = els[i + 1]!.getBoundingClientRect();
    const boundary = (aRect.bottom + bRect.top) / 2;
    gaps.push({
      y: boundary,
      insertIndex: readBlockIndex(els[i + 1]!),
      left: Math.min(aRect.left, bRect.left),
      width: Math.max(aRect.right, bRect.right) - Math.min(aRect.left, bRect.left),
    });
  }
  const lastEl = els[els.length - 1]!;
  const lastRect = lastEl.getBoundingClientRect();
  gaps.push({
    y: lastRect.bottom,
    insertIndex: readBlockIndex(lastEl) + 1,
    left: lastRect.left,
    width: lastRect.width,
  });
  return gaps;
}

export function collectPageRootDropRowsFromDom(): PageRootDropRow[] {
  return collectPageBlockElements().flatMap((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return [];
    const nodeId =
      el.getAttribute("data-builder-node-id") ??
      el.getAttribute("data-cms-block-node-id") ??
      "";
    return [
      {
        nodeId,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        blockIndex: readBlockIndex(el),
      },
    ];
  });
}

export function readPageRootDropBoundsFromDom(
  rows: ReadonlyArray<PageRootDropRow>,
): { top: number; bottom: number; left: number; width: number } {
  if (rows.length > 0) {
    const left = Math.min(...rows.map((row) => row.left));
    const right = Math.max(...rows.map((row) => row.left + row.width));
    return {
      top: Math.min(...rows.map((row) => row.top)),
      bottom: Math.max(...rows.map((row) => row.bottom)),
      left,
      width: Math.max(0, right - left),
    };
  }
  const main = document.querySelector("main");
  const rect = main?.getBoundingClientRect();
  if (rect && rect.width > 0) {
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      width: rect.width,
    };
  }
  return {
    top: 0,
    bottom: typeof window !== "undefined" ? window.innerHeight : 0,
    left: 0,
    width: typeof window !== "undefined" ? window.innerWidth : 0,
  };
}
