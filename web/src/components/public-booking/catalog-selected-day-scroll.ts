/** Scroll offset that centers `el` inside `strip` (relative to the strip, not an ancestor). */
export function selectedDayScrollLeft(strip: HTMLElement, el: HTMLElement): number {
  const stripRect = strip.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const left =
    strip.scrollLeft + (elRect.left - stripRect.left) - (strip.clientWidth - el.offsetWidth) / 2;
  return Math.max(0, left);
}

/** TUL-899: the strip shows one week per view; this is the offset of the next (+1) or previous (-1) week. */
export function weekScrollLeft(strip: Pick<HTMLElement, "scrollLeft" | "clientWidth" | "scrollWidth">, dir: 1 | -1): number {
  const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
  return Math.min(max, Math.max(0, strip.scrollLeft + dir * strip.clientWidth));
}
