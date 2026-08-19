/**
 * Pure edits on the nav link tree.
 *
 * Nav links are three levels deep — top row, submenu child, and (in a mega
 * panel) the links under a column heading. Editing the third level inline
 * means three nested `.map()` calls per keystroke handler, which is how a
 * panel file becomes unreadable and how an off-by-one silently rewrites the
 * wrong column.
 *
 * These are pure and total: every one returns a NEW array and leaves the input
 * untouched, so an edit that misses is visible in a test rather than as a
 * mutation that only shows up after a publish.
 */

import type { BuilderNavLink } from "@/lib/site-admin/builder-node/types";

type Links = ReadonlyArray<BuilderNavLink>;

function mapAt<T>(list: ReadonlyArray<T>, index: number, fn: (item: T) => T): T[] {
  return list.map((item, i) => (i === index ? fn(item) : item));
}

/** Replace fields on one grandchild (a link inside a mega column). */
export function patchGrandchild(
  links: Links,
  linkIndex: number,
  childIndex: number,
  leafIndex: number,
  patch: Partial<BuilderNavLink>,
): BuilderNavLink[] {
  return mapAt(links, linkIndex, (link) => ({
    ...link,
    children: mapAt(link.children ?? [], childIndex, (child) => ({
      ...child,
      children: mapAt(child.children ?? [], leafIndex, (leaf) => ({
        ...leaf,
        ...patch,
      })),
    })),
  }));
}

/** Append a link to a column, respecting the schema's cap of 8. */
export function addGrandchild(
  links: Links,
  linkIndex: number,
  childIndex: number,
  idSeed: string = String(Date.now()),
): BuilderNavLink[] {
  return mapAt(links, linkIndex, (link) => ({
    ...link,
    children: mapAt(link.children ?? [], childIndex, (child) => {
      const current = child.children ?? [];
      // The cap is the schema's, not a UI preference: a ninth entry is stripped
      // on validate, so adding one would look like it worked and then vanish.
      if (current.length >= 8) return child;
      return {
        ...child,
        children: [
          ...current,
          { id: `${child.id}-item-${idSeed}`, label: "New link", href: "/" },
        ],
      };
    }),
  }));
}

/**
 * Remove one link from a column.
 *
 * Removing the LAST one drops `children` entirely rather than leaving `[]`,
 * which turns the child back into an ordinary link — an empty column would
 * otherwise render as a heading with nothing under it.
 */
export function removeGrandchild(
  links: Links,
  linkIndex: number,
  childIndex: number,
  leafIndex: number,
): BuilderNavLink[] {
  return mapAt(links, linkIndex, (link) => ({
    ...link,
    children: mapAt(link.children ?? [], childIndex, (child) => {
      const next = (child.children ?? []).filter((_, i) => i !== leafIndex);
      return next.length > 0
        ? { ...child, children: next }
        : { ...child, children: undefined };
    }),
  }));
}

/** Set or clear the mega panel's featured promo card on a top-level link. */
export function patchFeatured(
  links: Links,
  linkIndex: number,
  patch: Partial<NonNullable<BuilderNavLink["featured"]>> | null,
): BuilderNavLink[] {
  return mapAt(links, linkIndex, (link) => {
    if (patch === null) return { ...link, featured: undefined };
    const next = { ...(link.featured ?? { title: "", href: "/" }), ...patch };
    // A card with no title and no destination is not a card. Clearing both
    // removes it, so emptying the fields is how an operator deletes it.
    if (!next.title.trim() && !next.href.trim()) {
      return { ...link, featured: undefined };
    }
    return { ...link, featured: next };
  });
}
