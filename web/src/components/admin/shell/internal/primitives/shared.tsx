"use client";

// ─── Scroll-lock counter ─────────────────────────────────────────────
// Tracks how many overlays (drawers + modals) are open so we only
// release body scroll when ALL of them have closed. Prevents the bug
// where closing drawer A releases scroll even though modal B is still open.
//
// The depth tracker is reconciled against an actual DOM probe: each
// unlock checks whether ANY overlay is still rendered before clearing
// `body.style.overflow`. This makes scroll-lock self-healing across:
//   - HMR cycles that lose effect cleanups
//   - Unmount races where cleanup runs after the next mount
//   - Stale provider-tree teardowns during navigation
// If overlays aren't actually rendered, scroll is restored regardless
// of what the counter thinks.
//
// Extracted from primitives.tsx — Phase 1f decomposition. Consumed by
// ConfirmDialog, DrawerShell, ModalShell, ConfirmModal, ShortcutsModal,
// ModalPopover, ConflictDialog. These helpers are intentionally NOT
// exported from the primitives.tsx public barrel; they're an internal
// implementation detail shared across the extracted modules.
let _overlayDepth = 0;
const OVERLAY_QUERY = '[data-tulala-drawer-panel],[data-tulala-modal-overlay],[data-tulala-confirm-dialog]';
export function reconcileScrollLock() {
  if (typeof document === "undefined") return;
  const stillOpen = document.querySelectorAll(OVERLAY_QUERY).length > 0;
  if (!stillOpen) {
    _overlayDepth = 0;
    document.body.style.overflow = "";
  }
}
export function lockScroll() {
  _overlayDepth++;
  if (typeof document !== "undefined") document.body.style.overflow = "hidden";
}
export function unlockScroll() {
  _overlayDepth = Math.max(0, _overlayDepth - 1);
  if (_overlayDepth === 0 && typeof document !== "undefined") {
    document.body.style.overflow = "";
  }
  // Defer one frame so the closing overlay's unmount has propagated to
  // the DOM, then reconcile. Catches the HMR-leak case where the
  // counter is wrong but no overlays are actually visible.
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(reconcileScrollLock);
  }
}
