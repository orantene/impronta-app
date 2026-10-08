/**
 * Rendered-overflow check for Mobile health (TUL-79).
 *
 * The tree check in `mobile-health.ts` only sees authored fixed widths, so a
 * header CTA that is wider than the phone (nav + button in a row, no wrap) was
 * reported as "All clear". This pass works on MEASURED boxes instead: any
 * visible element whose box sticks out of the viewport is an overflow.
 *
 * `findRenderedOverflow` is pure (takes plain boxes) so it is unit-testable;
 * `measureRenderedOverflow` is the thin DOM adapter.
 */

import type { MobileHealthIssue } from "./mobile-health";

export interface RenderedBox {
  id: string;
  kind: "button" | "container";
  label: string;
  left: number;
  right: number;
  /** True when an ancestor clips horizontal overflow, so nothing spills. */
  clipped: boolean;
  /**
   * True when the ONLY clipping ancestors are overflow:hidden/clip (no
   * scroller). Cut-off content is lost, not scrollable, so a button or link in
   * such a box is still a defect (a header CTA inside a clipped bar).
   */
  hardClipped?: boolean;
  /** True for position:fixed boxes (off-canvas drawers), which never scroll. */
  fixed: boolean;
  /** True when the parent box also overflows (report the outermost only). */
  parentOverflows?: boolean;
}

const TOLERANCE_PX = 1;
const MAX_ISSUES = 5;

export function findRenderedOverflow(
  boxes: ReadonlyArray<RenderedBox>,
  viewportWidth: number,
): MobileHealthIssue[] {
  if (!(viewportWidth > 0)) return [];
  const out: MobileHealthIssue[] = [];
  for (const b of boxes) {
    if (b.fixed || b.parentOverflows) continue;
    // A scroller (carousel, nav strip) legitimately holds wide content, and a
    // decorative box (slide backdrop) may be trimmed by its section. A button
    // that is only cut off by overflow:hidden is a real defect: the visitor
    // cannot reach it.
    if (b.clipped && !(b.kind === "button" && b.hardClipped)) continue;
    const spillRight = b.right - viewportWidth;
    const spillLeft = -b.left;
    if (spillRight <= TOLERANCE_PX && spillLeft <= TOLERANCE_PX) continue;
    const px = Math.round(Math.max(spillRight, spillLeft));
    out.push({
      kind: "overflow",
      severity: "warn",
      nodeId: b.id,
      nodeKind: b.kind,
      ownerSectionId: null,
      message: `${b.label} runs ${px}px past the edge of the ${Math.round(viewportWidth)}px screen. Shrink it, let it wrap, or move it into the menu.`,
    });
    if (out.length >= MAX_ISSUES) break;
  }
  return out;
}

export type AncestorClip = "none" | "scroll" | "hard";

/** Pure: classify a chain of ancestor `overflow-x` values. */
export function classifyAncestorClip(overflowXValues: ReadonlyArray<string>): AncestorClip {
  let hard = false;
  for (const v of overflowXValues) {
    if (v === "auto" || v === "scroll") return "scroll";
    if (v === "hidden" || v === "clip") hard = true;
  }
  return hard ? "hard" : "none";
}

function clipOfAncestors(el: Element, win: Window, stop: Element): AncestorClip {
  const values: string[] = [];
  for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
    values.push(win.getComputedStyle(p).overflowX);
  }
  return classifyAncestorClip(values);
}

/** Measure a document (the canvas iframe, or the page itself). */
export function measureRenderedOverflow(
  doc: Document,
  viewportWidth: number,
): MobileHealthIssue[] {
  const win = doc.defaultView;
  const body = doc.body;
  if (!win || !body || !(viewportWidth > 0)) return [];
  const overflowing = new Set<Element>();
  const boxes: Array<{ el: Element; box: RenderedBox }> = [];
  for (const el of Array.from(body.querySelectorAll("*"))) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.right <= viewportWidth + TOLERANCE_PX && r.left >= -TOLERANCE_PX) continue;
    const cs = win.getComputedStyle(el);
    const clip = clipOfAncestors(el, win, body);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    overflowing.add(el);
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
    boxes.push({
      el,
      box: {
        id: el.closest("[data-builder-node-id]")?.getAttribute("data-builder-node-id") ?? "",
        kind: tag === "button" || tag === "a" ? "button" : "container",
        label: text ? `"${text}"` : `A ${tag} element`,
        left: r.left,
        right: r.right,
        clipped: clip !== "none",
        hardClipped: clip === "hard",
        fixed: cs.position === "fixed",
      },
    });
  }
  for (const b of boxes) {
    const parent = b.el.parentElement;
    b.box.parentOverflows = !!parent && overflowing.has(parent);
  }
  return findRenderedOverflow(
    boxes.map((b) => b.box),
    viewportWidth,
  );
}
