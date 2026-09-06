/**
 * Grouping a menu board by the operator's own categories.
 *
 * WHY A PURE FUNCTION AND NOT JSX
 * ──────────────────────────────
 * The decisions here are the ones that go wrong: whether a strip appears at
 * all, what an ungrouped item does, and what a category's anchor id is. Each is
 * assertable in a unit test; none is assertable by looking at markup. The
 * rendering is the easy half.
 *
 * `talent_offerings.category` has existed all along and was never carried past
 * `WorkspaceMenuOffering`, so the board could not group and a category nav was
 * not buildable from what the renderer receives. It is carried now.
 */

/** The minimum an item needs for grouping. */
export type CategorisableItem = {
  id: string;
  category?: string | null;
};

export type MenuCategoryGroup<T extends CategorisableItem> = {
  /** The operator's label, or null for the ungrouped bucket. */
  label: string | null;
  /** DOM id for the section, so the strip can link to it. */
  anchorId: string;
  items: T[];
};

/**
 * A category label → a DOM-safe anchor id.
 *
 * Prefixed `menu-`, because a category called "reserve" would otherwise collide
 * with a page anchor of the same name, and the two would fight over one id.
 * Falls back to a positional id when a label slugifies to nothing (a category
 * named only in a script this regex drops, e.g. "前菜"), so the strip still
 * navigates rather than silently linking nowhere.
 */
export function menuCategoryAnchorId(label: string, index: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug ? `menu-${slug}` : `menu-group-${index + 1}`;
}

/**
 * Group items by their operator category, preserving the order the items
 * arrive in — that order is the operator's, set on the Menu page, and
 * re-sorting it here would silently override a deliberate arrangement.
 *
 * Items with no category collect into ONE trailing bucket with a null label.
 * They are not dropped (they are real menu items) and not given an invented
 * category name.
 */
export function groupMenuByCategory<T extends CategorisableItem>(
  items: ReadonlyArray<T>,
): Array<MenuCategoryGroup<T>> {
  const named = new Map<string, T[]>();
  const ungrouped: T[] = [];

  for (const item of items) {
    const label =
      typeof item.category === "string" && item.category.trim().length > 0
        ? item.category.trim()
        : null;
    if (label === null) {
      ungrouped.push(item);
      continue;
    }
    const bucket = named.get(label);
    if (bucket) bucket.push(item);
    else named.set(label, [item]);
  }

  // Anchor ids must be UNIQUE across the board, not merely derived. Two
  // categories can slugify to the same id — "Tacos" and "TACOS!" both give
  // `menu-tacos` — and then the second tab scrolls to the first section, which
  // reads as a broken link rather than a naming collision. Deduped by suffix,
  // keeping the first occurrence's clean id.
  const used = new Set<string>();
  const groups: Array<MenuCategoryGroup<T>> = [...named.entries()].map(
    ([label, groupItems], index) => {
      const base = menuCategoryAnchorId(label, index);
      let anchorId = base;
      let n = 2;
      while (used.has(anchorId)) anchorId = `${base}-${n++}`;
      used.add(anchorId);
      return { label, anchorId, items: groupItems };
    },
  );

  if (ungrouped.length > 0) {
    let anchorId = `menu-group-${groups.length + 1}`;
    let n = 2;
    while (used.has(anchorId)) anchorId = `menu-group-${groups.length + 1}-${n++}`;
    groups.push({ label: null, anchorId, items: ungrouped });
  }

  return groups;
}

/**
 * Should the strip render?
 *
 * TWO OR MORE NAMED categories. One category is not navigation — it is a tab
 * that goes to the top of the only thing on screen. A board whose items all
 * carry a null category (the common case today: El Paisa's two published items
 * are both null) gets no strip rather than an empty one, which is the
 * difference between a feature that is off and a feature that looks broken.
 */
export function shouldShowCategoryNav<T extends CategorisableItem>(
  groups: ReadonlyArray<MenuCategoryGroup<T>>,
): boolean {
  return groups.filter((g) => g.label !== null).length >= 2;
}
