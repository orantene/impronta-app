"use client";

/**
 * NavSubmenuPin — holds one nav submenu open on the canvas while it is edited.
 *
 * A dropdown or mega panel only exists under a real pointer. Editing one meant
 * hovering with one hand and reaching for the panel with the other, or giving
 * up and publishing to see the result. The phone drawer got an answer to this
 * (the mobile HUD's "open on canvas"); the desktop panel did not.
 *
 * Same mechanism, same guarantees: ONE injected stylesheet, scoped to a single
 * link, writing NOTHING to the tree — so a pinned panel can never be published
 * by accident, and closing the editor takes the rule with it.
 */

import { useEditContext } from "./edit-context";

/**
 * The rule that holds one panel open.
 *
 * Scoped by BOTH the nav node and the link, because a header nav with four
 * submenus would otherwise spring all of them open at once and cover the page
 * it is supposed to be sitting above.
 *
 * `transition:none` matters: the panel's normal open is animated with a delay
 * (the close-forgiveness rule), and an editor pin that fades in every re-render
 * reads as flicker rather than as a held state.
 */
export function pinnedSubmenuCss(nodeId: string, linkId: string): string {
  const scope = `[data-builder-node-id="${nodeId}"] [data-bn-nav-link-id="${linkId}"]`;
  return [
    `${scope} > .site-builder-node--nav-submenu{`,
    "opacity:1 !important;visibility:visible !important;",
    "transform:translateX(-50%) translateY(0) !important;transition:none !important;",
    "}",
    // Anchored panels are centred with translateX(-50%); a full-bleed one is
    // not, and inheriting that transform would shove it half off the page.
    `${scope}[data-bn-mega-width="full"] > .site-builder-node--nav-submenu{`,
    "transform:none !important;",
    "}",
    // Dropdowns (no mega width attribute) are left-aligned, not centred.
    `${scope}:not([data-bn-mega-width]) > .site-builder-node--nav-submenu{`,
    "transform:none !important;",
    "}",
  ].join("");
}

/**
 * The nav link under a canvas click, if there is one.
 *
 * Lives here rather than inline in `selection-layer.tsx`: that file is on the
 * size ratchet because it has already grown into a god file once, and "one
 * small block per feature" is exactly how it got there.
 */
export function navLinkIdFromEventTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  return (
    target.closest("[data-bn-nav-link-id]")?.getAttribute("data-bn-nav-link-id") ??
    null
  );
}

export function NavSubmenuPin() {
  const { pinnedNavSubmenu } = useEditContext();
  if (!pinnedNavSubmenu) return null;
  return (
    // eslint-disable-next-line react/no-danger -- a stylesheet built from ids
    // this editor minted, injected into editor chrome only. There is no other
    // way to hold a CSS-only :hover panel open without a real pointer.
    <style
      data-nav-submenu-pin={`${pinnedNavSubmenu.nodeId}:${pinnedNavSubmenu.linkId}`}
      dangerouslySetInnerHTML={{
        __html: pinnedSubmenuCss(pinnedNavSubmenu.nodeId, pinnedNavSubmenu.linkId),
      }}
    />
  );
}
