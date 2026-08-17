"use client";

/**
 * carousel-edit-bridge.ts — the editor's hold on a live carousel.
 *
 * Owner bug, verbatim: "the slider components.. so bad, one slide pass i cant
 * catch the second or third one". On the editor canvas a hero carousel ran its
 * REAL autoplay (`carousel.tsx` → `HeroCarousel`), so slide 2 crossfaded away
 * mid-click; and every INACTIVE slide carries `inert` + `aria-hidden` (a
 * deliberate WCAG 4.1.2 fix, see carousel.tsx). Those two together make slides
 * 2..N literally unreachable while editing: the one you can click keeps
 * changing, and the ones you want are non-interactive.
 *
 * This is the smallest thing that fixes it — a process-singleton micro-store in
 * exactly the shape of `selection-bridge.ts` / `hover-bridge.ts`, written by the
 * edit chrome and read by the carousel:
 *
 *   - `registerCarouselEditMode()` — the editor canvas calls this on mount.
 *     While at least one canvas is registered, every hero carousel treats
 *     autoplay as OFF. Refcounted, so the page canvas and a curated section's
 *     children canvas can register independently and either can unmount first.
 *   - `setCarouselSlide(nodeId, index)` — the inspector's slide manager pins
 *     which slide the canvas shows. Keyed by node id, so the pin survives
 *     selecting away and coming back.
 *
 * WHY A BRIDGE AND NOT A RENDER OPTION. `ClientBuilderCanvas` memoizes its
 * render-options object precisely so an unchanged subtree can bail out of
 * re-rendering (see its W2-T1 comment). Threading the active slide through
 * those options would re-identify them on every slide click and repaint the
 * whole canvas. A micro-store re-renders only the one carousel that reads it.
 *
 * PUBLISHED SITE: nothing ever calls the writers. `editing` stays false and the
 * pin map stays empty, so the carousel behaves exactly as it does today — same
 * autoplay, same markup, byte-identical SSR. Both server snapshots are frozen
 * module constants returned by identity (a fresh allocation per call makes
 * `useSyncExternalStore` loop forever).
 */
import { useCallback, useSyncExternalStore } from "react";

type Listener = () => void;

/** The one shared empty pin map. Returned by identity, never re-allocated. */
const EMPTY_PINS: Readonly<Record<string, number>> = Object.freeze({});

let editModeRefCount = 0;
let editing = false;
let pinnedSlides: Readonly<Record<string, number>> = EMPTY_PINS;

const editingListeners = new Set<Listener>();
const pinnedListeners = new Set<Listener>();

function notify(listeners: Set<Listener>): void {
  for (const listener of listeners) listener();
}

/**
 * Mark this process as "an editor canvas is mounted". Returns the unregister,
 * so a caller can hand it straight back from a `useEffect`. Refcounted: edit
 * mode stays on until the LAST canvas unmounts.
 */
export function registerCarouselEditMode(): () => void {
  editModeRefCount += 1;
  if (editModeRefCount === 1) {
    editing = true;
    notify(editingListeners);
  }
  let released = false;
  return () => {
    // Guard double-release: React 18 StrictMode double-invokes effect cleanups
    // in development, and an unguarded decrement would drive the count negative
    // and strand `editing` at true for the rest of the session.
    if (released) return;
    released = true;
    editModeRefCount -= 1;
    if (editModeRefCount === 0) {
      editing = false;
      // Pins are editor-only state; leaving them behind would pin a carousel on
      // a canvas that is no longer being edited.
      pinnedSlides = EMPTY_PINS;
      notify(editingListeners);
      notify(pinnedListeners);
    }
  };
}

/** Pin the slide the canvas should show for `nodeId`. No-op when unchanged. */
export function setCarouselSlide(nodeId: string, index: number): void {
  const next = Math.max(0, Math.trunc(index));
  if (pinnedSlides[nodeId] === next) return;
  pinnedSlides = Object.freeze({ ...pinnedSlides, [nodeId]: next });
  notify(pinnedListeners);
}

/** Drop the pin for `nodeId` (the carousel goes back to its own index). */
export function clearCarouselSlide(nodeId: string): void {
  if (!(nodeId in pinnedSlides)) return;
  const next: Record<string, number> = { ...pinnedSlides };
  delete next[nodeId];
  pinnedSlides = Object.freeze(next);
  notify(pinnedListeners);
}

export function subscribeCarouselEditing(listener: Listener): () => void {
  editingListeners.add(listener);
  return () => {
    editingListeners.delete(listener);
  };
}

export function subscribeCarouselPinnedSlides(listener: Listener): () => void {
  pinnedListeners.add(listener);
  return () => {
    pinnedListeners.delete(listener);
  };
}

export function getCarouselEditingSnapshot(): boolean {
  return editing;
}

export function getCarouselPinnedSlide(nodeId: string): number | null {
  const pinned = pinnedSlides[nodeId];
  return typeof pinned === "number" ? pinned : null;
}

/**
 * Server snapshot for both slices. Edit mode is a client-only interaction, so
 * the server always renders the published behavior.
 */
export function getCarouselEditServerSnapshot(): false {
  return false;
}

export function getCarouselPinnedServerSnapshot(): null {
  return null;
}

/** True while an editor canvas is mounted → hero autoplay must not run. */
export function useCarouselEditing(): boolean {
  return useSyncExternalStore(
    subscribeCarouselEditing,
    getCarouselEditingSnapshot,
    getCarouselEditServerSnapshot,
  );
}

/**
 * The slide the inspector pinned for this carousel, or null when none. A
 * PRIMITIVE snapshot, so it is `Object.is`-stable and a pin on some other
 * carousel never wakes this one.
 */
export function useCarouselPinnedSlide(nodeId: string): number | null {
  const getSnapshot = useCallback(() => getCarouselPinnedSlide(nodeId), [nodeId]);
  return useSyncExternalStore(
    subscribeCarouselPinnedSlides,
    getSnapshot,
    getCarouselPinnedServerSnapshot,
  );
}

/**
 * TEST ONLY — drop every listener and reset both slices. The store is a module
 * singleton, so a test that registers edit mode would otherwise leak it into
 * the next test in the same file.
 */
export function __resetCarouselEditBridgeForTests(): void {
  editModeRefCount = 0;
  editing = false;
  pinnedSlides = EMPTY_PINS;
  editingListeners.clear();
  pinnedListeners.clear();
}
