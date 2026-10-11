/** Scroll offset that centers `el` inside `strip` (relative to the strip, not an ancestor). */
export function selectedDayScrollLeft(strip: HTMLElement, el: HTMLElement): number {
  const stripRect = strip.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const left =
    strip.scrollLeft + (elRect.left - stripRect.left) - (strip.clientWidth - el.offsetWidth) / 2;
  return Math.max(0, left);
}
