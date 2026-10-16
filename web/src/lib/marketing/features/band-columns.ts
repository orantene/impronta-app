/**
 * How many columns a feature band uses at a breakpoint that fits `max` cards
 * a row: never more than it has cards, and never a count that leaves one card
 * alone on the last row when a smaller count avoids it (5 at four-up is 3 + 2,
 * not 4 + 1). Pure, so the layout rule is testable without a browser.
 */
export function bandColumns(count: number, max: number): number {
  if (count <= max) return Math.max(count, 1);
  for (let c = max; c >= 2; c--) {
    if (count % c !== 1) return c;
  }
  return max;
}
