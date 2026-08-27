"use client";

/**
 * DrawerScrim — the dimmed, click-to-close backdrop behind a modal drawer.
 *
 * The chrome behind a modal drawer is already `inert` (see
 * `drawer-modal-inert.ts`), so it cannot be clicked or tabbed into. What was
 * missing was any VISIBLE sign of that: the editor stayed bright and fully
 * legible behind the panel, so a publish drawer read as one more floating
 * widget rather than "this is the thing you are doing right now". The scrim
 * makes the inert state honest — the editor recedes, the drawer is the
 * subject, and clicking the faded area closes it.
 *
 * Close routes through the drawer's `onRequestClose`, so a drawer that
 * refuses to close mid-operation (Publish, while publishing) keeps refusing:
 * it passes `undefined` and the scrim becomes a plain dimmer.
 *
 * `data-edit-overlay` keeps `drawer-modal-inert` from ever marking the scrim
 * itself inert (that selector deliberately skips drawers and overlays).
 */

interface DrawerScrimProps {
  /** Paints just under the drawer it belongs to. */
  zIndex: number;
  /** Omit to make the scrim a non-interactive dimmer (e.g. mid-publish). */
  onRequestClose?: () => void;
}

export function DrawerScrim({ zIndex, onRequestClose }: DrawerScrimProps) {
  return (
    <>
      <style>{`@keyframes edit-drawer-scrim-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <div
        aria-hidden
        data-edit-overlay="drawer-scrim"
        onClick={onRequestClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex,
          background: "rgba(28, 25, 23, 0.4)",
          animation: "edit-drawer-scrim-in 180ms ease-out",
          cursor: onRequestClose ? "pointer" : "default",
        }}
      />
    </>
  );
}
