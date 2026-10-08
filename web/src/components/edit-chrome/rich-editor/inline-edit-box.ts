/**
 * TUL-78 #7 / live QA E-06 — geometry of the inline text edit box.
 *
 * The box mirrors the hidden target's rectangle. Two things went wrong:
 *   1. An inline or shrink-wrapped target (a span, an inline-block heading)
 *      reports a rectangle only as wide as its current words, so the box was
 *      narrow and long words broke mid-word. Such targets now use their
 *      container's width so text wraps at word boundaries like the final page.
 *   2. The box grew taller than the hidden target while the paragraph below
 *      stayed put, so the two overlapped. `growTargetToBox` keeps the hidden
 *      target at least as tall as the box so following content is pushed down.
 */

export interface InlineEditRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface InlineEditBox {
  top: number;
  left: number;
  width: number;
}

const SHRINK_WRAPPED = /^(inline|inline-block|inline-flex|inline-grid|contents|table)/;

export function resolveInlineEditBox(input: {
  rect: InlineEditRect;
  parentRect: { left: number; width: number } | null;
  display: string;
  viewportWidth: number;
}): InlineEditBox {
  const { rect, parentRect, display, viewportWidth } = input;
  let left = rect.left;
  let width = rect.width;
  if (parentRect && SHRINK_WRAPPED.test(display) && parentRect.width > width) {
    left = parentRect.left;
    width = parentRect.width;
  }
  const maxWidth = Math.max(0, viewportWidth - Math.max(0, left));
  return { top: rect.top, left, width: Math.min(width, maxWidth) };
}

/** Wrapping rules so text breaks at word boundaries and long words never overflow. */
export const INLINE_EDIT_WRAP_STYLE = {
  boxSizing: "border-box",
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
  wordBreak: "normal",
} as const;

/**
 * Keep the hidden target at least `boxHeight` tall while editing so content
 * below it moves down instead of sitting under the growing box.
 * `releaseTargetGrowth` restores the original min-height.
 */
export function growTargetToBox(target: HTMLElement, boxHeight: number): void {
  if (target.dataset.inlineNaturalMinHeight === undefined) {
    target.dataset.inlineNaturalMinHeight = target.style.minHeight || "";
  }
  if (boxHeight > target.getBoundingClientRect().height + 0.5) {
    target.style.minHeight = `${Math.ceil(boxHeight)}px`;
  }
}

export function releaseTargetGrowth(target: HTMLElement): void {
  if (target.dataset.inlineNaturalMinHeight === undefined) return;
  target.style.minHeight = target.dataset.inlineNaturalMinHeight;
  delete target.dataset.inlineNaturalMinHeight;
}
