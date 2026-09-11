"use client";

/**
 * The Overview's snapshot, handed from the server page to the shell.
 *
 * WHY A STORE AND NOT THE BRIDGE. `/admin/page.tsx` is a server component
 * that reads the Overview's numbers (`loadOverviewSnapshot`) for THAT request
 * only; the admin layout's bridge is read on every admin navigation, and the
 * Overview's seven readers do not belong on every page's critical path. The
 * page publishes here, `OverviewBoard` subscribes; `router.refresh()` from
 * the realtime bridge re-renders the page and republishes.
 *
 * `null` means "no snapshot for this render": the board draws its loading
 * state, never zeros.
 */

import { useLayoutEffect, useSyncExternalStore } from "react";

import type { OverviewSnapshot } from "@/lib/overview/model";

let current: OverviewSnapshot | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function read(): OverviewSnapshot | null {
  return current;
}

function readServer(): OverviewSnapshot | null {
  return null;
}

export function publishOverviewSnapshot(snapshot: OverviewSnapshot | null): void {
  if (current === snapshot) return;
  current = snapshot;
  for (const listener of listeners) listener();
}

export function useOverviewSnapshot(): OverviewSnapshot | null {
  return useSyncExternalStore(subscribe, read, readServer);
}

/** Rendered by the server page; publishes before paint and clears on leave. */
export function OverviewSnapshotSyncer({ snapshot }: { snapshot: OverviewSnapshot | null }) {
  useLayoutEffect(() => {
    publishOverviewSnapshot(snapshot);
    return () => publishOverviewSnapshot(null);
  }, [snapshot]);
  return null;
}
