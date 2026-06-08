"use client";

import { useSyncExternalStore } from "react";

import {
  BUILDER_BREAKPOINTS_CHANGED,
  DEFAULT_BUILDER_BREAKPOINTS,
  loadCustomBreakpoints,
  type BuilderBreakpoint,
} from "./breakpoint-registry";

const SERVER_SNAPSHOT: BuilderBreakpoint[] = [...DEFAULT_BUILDER_BREAKPOINTS];

/** Module cache — useSyncExternalStore requires referential stability. */
let cachedStorageRaw: string | null | undefined;
let cachedSnapshot: BuilderBreakpoint[] = SERVER_SNAPSHOT;

function invalidateBreakpointCache(): void {
  cachedStorageRaw = undefined;
}

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => {
    invalidateBreakpointCache();
    onStoreChange();
  };
  if (typeof window === "undefined") {
    return () => undefined;
  }
  window.addEventListener(BUILDER_BREAKPOINTS_CHANGED, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(BUILDER_BREAKPOINTS_CHANGED, handler);
    window.removeEventListener("storage", handler);
  };
}

function getSnapshot(): BuilderBreakpoint[] {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  const raw = window.localStorage.getItem("impronta.editChrome.customBreakpoints.v1");
  if (raw === cachedStorageRaw) return cachedSnapshot;
  cachedStorageRaw = raw;
  cachedSnapshot = loadCustomBreakpoints();
  return cachedSnapshot;
}

function getServerSnapshot(): BuilderBreakpoint[] {
  return SERVER_SNAPSHOT;
}

/** Author-defined + default breakpoint tiers (localStorage-backed on the client). */
export function useBuilderBreakpoints(): BuilderBreakpoint[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function notifyBuilderBreakpointsChanged(): void {
  if (typeof window === "undefined") return;
  invalidateBreakpointCache();
  window.dispatchEvent(new Event(BUILDER_BREAKPOINTS_CHANGED));
}
