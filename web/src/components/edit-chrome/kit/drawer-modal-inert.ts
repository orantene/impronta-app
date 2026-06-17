"use client";

/**
 * drawer-modal-inert — make the editor chrome BEHIND an open modal drawer
 * inert (A11Y-1).
 *
 * When a utility drawer (Publish, Theme, Revisions, Page settings, Assets,
 * Collections, Schedule, Comments, Media picker) becomes a true modal dialog,
 * everything behind it must drop out of the tab order and stop receiving
 * pointer interaction — the browser-native way to express "the rest of the
 * page is temporarily unavailable" is the HTML `inert` attribute.
 *
 * What we mark inert: the editor TOPBAR (`[data-edit-topbar]`) and the canvas
 * chrome / page surface behind the drawer. What we deliberately DON'T touch:
 * the drawers and overlays themselves (`[data-edit-drawer]`, `[data-edit-overlay]`)
 * and any centred modal — those stay interactive so the trap can cycle focus,
 * and so a drawer that opens a confirm overlay (e.g. Publish → diff) keeps
 * working.
 *
 * `inert` blocks user focus + pointer interaction only; it does NOT block
 * programmatic JS or `postMessage`, so the Theme drawer's live-preview bridge
 * to the canvas iframe keeps working while the canvas is inert — exactly the
 * behaviour we want (operator can't click the page, but the preview still
 * updates).
 *
 * Ref-counted at the module level so nested / stacked modal drawers compose:
 * the chrome only un-inerts once the LAST modal drawer closes. The set of
 * elements is re-resolved on every acquire (drawers mount lazily), and we
 * only clear `inert` on elements WE set (tracked in `ownedNodes`) so we never
 * stomp an `inert` that some other code owns.
 */

const BEHIND_DRAWER_SELECTOR = [
  // Editor topbar (publish / undo / device / exit cluster).
  "[data-edit-topbar]",
  // Left command dock + inspector command rail (the launcher columns).
  "[data-command-dock]",
  "[data-inspector-command-rail]",
  // Non-homepage in-editor canvas (cms_page / talent_page / platform_lab).
  "[data-in-editor-canvas-region]",
  // Tablet / mobile device-preview iframe host.
  "[data-edit-iframe-host]",
].join(", ");

let openModalCount = 0;
const ownedNodes = new Set<HTMLElement>();

function collectBehindChrome(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return Array.from(
    document.querySelectorAll<HTMLElement>(BEHIND_DRAWER_SELECTOR),
  );
}

function applyInert(): void {
  for (const node of collectBehindChrome()) {
    // Never re-inert (and never later un-inert) a node that was already inert
    // for some other reason — only own nodes we ourselves flip.
    if (node.inert) continue;
    node.inert = true;
    ownedNodes.add(node);
  }
}

function releaseInert(): void {
  for (const node of ownedNodes) {
    node.inert = false;
  }
  ownedNodes.clear();
}

/**
 * Mark the behind-drawer editor chrome inert. Returns a release function.
 * Idempotent per caller: the controller ref-counts, so calling acquire twice
 * requires two releases. The release function guards against double-release.
 */
export function acquireBehindDrawerInert(): () => void {
  if (typeof document === "undefined") return () => {};
  openModalCount += 1;
  if (openModalCount === 1) {
    applyInert();
  } else {
    // A second modal opened on top — re-resolve so any chrome that mounted
    // since the first acquire is covered too.
    applyInert();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    openModalCount = Math.max(0, openModalCount - 1);
    if (openModalCount === 0) {
      releaseInert();
    }
  };
}

/** Test-only: current open modal-drawer ref-count. */
export function __getOpenModalCount(): number {
  return openModalCount;
}
