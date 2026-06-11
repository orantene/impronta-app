"use client";

/**
 * component-defaults-bridge.ts — GAP B-4 live preview of DRAFT component defaults.
 *
 * Unlike theme TOKENS (which live-preview via a CSS-var write on the canvas
 * root — see theme-preview-bridge), per-component-type DEFAULT styles are
 * resolved by a per-node STYLE MERGE at render time. So previewing a draft edit
 * means re-rendering the canvas with the new `componentStyleDefaults`. This
 * process-singleton micro-store (same pattern as selection-bridge) holds the
 * operator's working draft map; `ClientBuilderCanvas` subscribes and feeds it
 * into its `renderBuilderNodes` options, so a draft edit repaints the cascade
 * instantly — no Publish, no router.refresh.
 *
 * `null` = no preview active (drawer's Components tab closed / not loaded): the
 * canvas falls back to the LIVE defaults passed as a prop from the server, so
 * the editor matches the published page until the operator starts editing.
 */
import { useSyncExternalStore } from "react";

import type { ComponentStyleDefaults } from "@/lib/site-admin/builder-node/component-style-defaults";

type Listener = () => void;

let draftDefaults: ComponentStyleDefaults | null = null;
const listeners = new Set<Listener>();

/** Publish the working draft component-default map (replaces + notifies). */
export function publishComponentDefaultsPreview(
  defaults: ComponentStyleDefaults,
): void {
  if (Object.is(draftDefaults, defaults)) return;
  draftDefaults = defaults;
  for (const l of listeners) l();
}

/** Clear the preview → the canvas reverts to the LIVE defaults prop. */
export function clearComponentDefaultsPreview(): void {
  if (draftDefaults === null) return;
  draftDefaults = null;
  for (const l of listeners) l();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ComponentStyleDefaults | null {
  return draftDefaults;
}

function getServerSnapshot(): ComponentStyleDefaults | null {
  return null;
}

/** Subscribe to the draft component-default map (null when no preview active). */
export function useComponentDefaultsPreview(): ComponentStyleDefaults | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
