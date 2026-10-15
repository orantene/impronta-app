/**
 * "1 item" / "3 items" with the noun agreeing in the viewer's language.
 * `t` is the dashboard translator; the singular and plural nouns are separate
 * dictionary keys so Spanish never renders "1 artículos" (TUL-722).
 */
export function countItemsLabel(t: (text: string) => string, count: number): string {
  return `${count} ${t(count === 1 ? "item" : "items")}`;
}
