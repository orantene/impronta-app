"use client";

/**
 * Stale-deployment detection — shared by any client code that calls a
 * Next.js Server Action.
 *
 * After a deploy, a tab that has been open since before it is still
 * running the OLD client bundle. Its Server Action calls carry the OLD
 * encrypted action id; the NEW server no longer recognizes it and throws:
 *
 *   "Failed to find Server Action ... This request might be from an
 *    older or newer deployment." (Next.js error E975)
 *
 * Treated as a generic failure, that reads to the admin as a dead-end
 * "couldn't load/save" with no path to recovery short of guessing to
 * hard-refresh — exactly what happened to Chiara on 2026-09-18 (load) and
 * would happen identically on save. `isStaleDeploymentError` recognizes
 * that shape (plus the equivalent stale-chunk fetch failures);
 * `notifyStaleDeployment` dispatches a window event any mounted
 * `<StaleDeploymentBanner>` picks up, offering a one-click reload instead
 * of a dead-end error state.
 */

const STALE_DEPLOYMENT_EVENT = "tulala:stale-deployment";

const STALE_MARKERS = [
  "failed to find server action",
  "this request might be from an older or newer deployment",
  // Webpack/Turbopack chunk fetches 404 the same way once a deploy has
  // rotated the asset hashes out from under an open tab.
  "loading chunk",
  "failed to fetch dynamically imported module",
  "chunkloaderror",
];

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "";
}

export function isStaleDeploymentError(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase();
  if (!message) return false;
  return STALE_MARKERS.some((marker) => message.includes(marker));
}

/** Dispatched by any call site that detects a stale-deployment error. */
export function notifyStaleDeployment() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STALE_DEPLOYMENT_EVENT));
}

/** Subscribe a mounted banner. Returns the unsubscribe function. */
export function onStaleDeployment(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(STALE_DEPLOYMENT_EVENT, handler);
  return () => window.removeEventListener(STALE_DEPLOYMENT_EVENT, handler);
}
