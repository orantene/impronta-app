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
 *
 * GENERALISED, NOT COPIED (2026-08-17, slideshow backgrounds)
 * ──────────────────────────────────────────────────────────
 * A container's `backgroundMedia` slideshow has the IDENTICAL problem: on the
 * editor canvas it would rotate under the operator's pointer and slides 2..N
 * would be uncatchable. The remedy is the same store, so rather than a second
 * near-identical bridge the pin map grew a CHANNEL: pins are keyed
 * `<channel>:<nodeId>` instead of `<nodeId>`.
 *
 * The channel is load-bearing, not decoration. One node can be a hero carousel
 * AND carry a background slideshow, and those are two independent "which slide
 * is showing" answers; a nodeId-only key would have them silently overwrite
 * each other. The `*CarouselSlide` names below are kept as the "carousel"
 * channel's wrappers so #1203's call sites and tests are untouched.
 */
import { useCallback, useSyncExternalStore } from "react";

type Listener = () => void;

/**
 * Which "which slide is showing" question a pin answers. One node can own more
 * than one at a time, so the channel is part of the key.
 */
export type SlidePinChannel = "carousel" | "background";

function pinKey(channel: SlidePinChannel, nodeId: string): string {
  return `${channel}:${nodeId}`;
}

/** The one shared empty pin map. Returned by identity, never re-allocated. */
const EMPTY_PINS: Readonly<Record<string, number>> = Object.freeze({});

let editModeRefCount = 0;
let previewSuppressed = false;
let editing = false;
let pinnedSlides: Readonly<Record<string, number>> = EMPTY_PINS;

const editingListeners = new Set<Listener>();
const pinnedListeners = new Set<Listener>();

function notify(listeners: Set<Listener>): void {
  for (const listener of listeners) listener();
}

/**
 * The one place "is the operator editing" is decided.
 *
 * TWO inputs, not one. The refcount answers "is an editor surface mounted";
 * `previewSuppressed` answers "has the operator pressed Preview". Preview is
 * the mode where every other affordance unmounts so the page behaves like it
 * does for a real visitor (EditShell's `!previewing ? …` layers), and a slider
 * frozen there is the editor lying about the page. Computing it in ONE place
 * is what keeps the two inputs from disagreeing — the alternative (each
 * registration site deciding for itself) is how the flag gap below happened.
 */
function computeEditing(): boolean {
  return editModeRefCount > 0 && !previewSuppressed;
}

/** Recompute `editing`; notify + drop pins only when the answer changed. */
function syncEditing(): void {
  const next = computeEditing();
  if (next === editing) return;
  editing = next;
  if (!editing) {
    // Pins are editor-only state. Leaving them behind would strand a carousel
    // on one slide for a surface nobody is editing (and, in preview, would show
    // a slider frozen on slide 3).
    pinnedSlides = EMPTY_PINS;
    notify(pinnedListeners);
  }
  notify(editingListeners);
}

/**
 * Mark this process as "an editor surface is mounted". Returns the unregister,
 * so a caller can hand it straight back from a `useEffect`. Refcounted: edit
 * mode stays on until the LAST surface unmounts.
 *
 * WHO CALLS THIS, AND THE GAP THAT MADE IT MATTER (2026-08-17)
 * ────────────────────────────────────────────────────────────
 * #1203 registered from `ClientBuilderCanvas` and `ClientSectionChildren`
 * only. Both sat behind the since-deleted `NEXT_PUBLIC_BUILDER_CLIENT_CANVAS`
 * flag, which was DEFAULT OFF: with the flag unset the
 * editor rendered the freeform tree SERVER-side, no client canvas mounted,
 * nothing ever called this, and the hero carousel autoplayed under the
 * operator's pointer exactly as it did before the fix. The carousel itself is
 * a client component either way, so it was hydrated and subscribed — it was
 * simply never told. `CarouselEditModeBinding`, mounted by `EditShell`, closes
 * that: EditShell is present whenever the operator is editing, on every surface
 * including the ones that mount no client canvas at all.
 */
export function registerCarouselEditMode(): () => void {
  editModeRefCount += 1;
  syncEditing();
  let released = false;
  return () => {
    // Guard double-release: React 18 StrictMode double-invokes effect cleanups
    // in development, and an unguarded decrement would drive the count negative
    // and strand `editing` at true for the rest of the session.
    if (released) return;
    released = true;
    editModeRefCount -= 1;
    syncEditing();
  };
}

/**
 * Preview suppression. `true` while the operator is in the editor's Preview
 * mode, which forces `editing` off no matter how many surfaces are registered
 * — so autoplay runs and the slider is what a visitor would see.
 *
 * Deliberately NOT a refcount: preview is one global mode with one owner
 * (EditShell), and a count would let a stale increment strand the page in
 * "preview" with every editing affordance still on screen.
 */
export function setCarouselEditPreviewing(next: boolean): void {
  if (previewSuppressed === next) return;
  previewSuppressed = next;
  syncEditing();
}

/**
 * Pin the slide the canvas should show for `channel`/`nodeId`. No-op when
 * unchanged, so a repeat click cannot wake every subscriber.
 */
export function setPinnedSlide(
  channel: SlidePinChannel,
  nodeId: string,
  index: number,
): void {
  const key = pinKey(channel, nodeId);
  const next = Math.max(0, Math.trunc(index));
  if (pinnedSlides[key] === next) return;
  pinnedSlides = Object.freeze({ ...pinnedSlides, [key]: next });
  notify(pinnedListeners);
}

/** Drop the pin (the slider goes back to driving its own index). */
export function clearPinnedSlide(channel: SlidePinChannel, nodeId: string): void {
  const key = pinKey(channel, nodeId);
  if (!(key in pinnedSlides)) return;
  const next: Record<string, number> = { ...pinnedSlides };
  delete next[key];
  pinnedSlides = Object.freeze(next);
  notify(pinnedListeners);
}

export function getPinnedSlide(
  channel: SlidePinChannel,
  nodeId: string,
): number | null {
  const pinned = pinnedSlides[pinKey(channel, nodeId)];
  return typeof pinned === "number" ? pinned : null;
}

/**
 * The slide the inspector pinned on this channel, or null when none. A
 * PRIMITIVE snapshot, so it is `Object.is`-stable and a pin somewhere else
 * never wakes this subscriber.
 */
export function usePinnedSlide(
  channel: SlidePinChannel,
  nodeId: string,
): number | null {
  const getSnapshot = useCallback(
    () => getPinnedSlide(channel, nodeId),
    [channel, nodeId],
  );
  return useSyncExternalStore(
    subscribeCarouselPinnedSlides,
    getSnapshot,
    getCarouselPinnedServerSnapshot,
  );
}

/** Pin the slide the canvas should show for `nodeId`. No-op when unchanged. */
export function setCarouselSlide(nodeId: string, index: number): void {
  setPinnedSlide("carousel", nodeId, index);
}

/** Drop the pin for `nodeId` (the carousel goes back to its own index). */
export function clearCarouselSlide(nodeId: string): void {
  clearPinnedSlide("carousel", nodeId);
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
  return getPinnedSlide("carousel", nodeId);
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
 * The same flag under a name that does not claim to be about carousels, for
 * the other things on the canvas that must stop moving while someone edits
 * them (today: a container's background slideshow). Deliberately an alias and
 * NOT a second refcount — "an editor canvas is mounted" is one fact.
 */
export function useEditCanvasMotionPaused(): boolean {
  return useCarouselEditing();
}

/**
 * The slide the inspector pinned for this carousel, or null when none. A
 * PRIMITIVE snapshot, so it is `Object.is`-stable and a pin on some other
 * carousel never wakes this one.
 */
export function useCarouselPinnedSlide(nodeId: string): number | null {
  return usePinnedSlide("carousel", nodeId);
}

/**
 * TEST ONLY — drop every listener and reset both slices. The store is a module
 * singleton, so a test that registers edit mode would otherwise leak it into
 * the next test in the same file.
 */
export function __resetCarouselEditBridgeForTests(): void {
  editModeRefCount = 0;
  previewSuppressed = false;
  editing = false;
  pinnedSlides = EMPTY_PINS;
  editingListeners.clear();
  pinnedListeners.clear();
}
