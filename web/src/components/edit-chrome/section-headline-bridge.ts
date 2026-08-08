"use client";

/**
 * section-headline-bridge — the live headline of every curated section the
 * operator has edited in this editor session.
 *
 * WAVE2-2.3 ("block-list labels go stale after a text edit"). The navigator's
 * row labels come from `sectionDisplayName`, whose headline input is
 * `headingProbe`: a server read of `props_jsonb` fired once per
 * `${pageVersion}:${sectionIdSet}` and then memoised behind a request-key ref.
 * A text edit changes neither the page version nor the id set, so the probe
 * never re-fires and the row keeps rendering a snapshot taken before the edit.
 * The data was already correct everywhere else - this is the same "surface did
 * not re-derive" family as the canvas-lies incidents, one layer up.
 *
 * The fix is a subscription, not a forced refresh: EditProvider publishes a
 * section's headline here at the single point where its props are actually
 * PERSISTED, and the navigator prefers that over the probe. Publishing on
 * commit (not per keystroke) is deliberate - wave 3 took the navigator off the
 * per-character re-render path and this must not put it back.
 *
 * Same process-singleton `useSyncExternalStore` shape as builder-tree-bridge /
 * draft-props-bridge / hover-bridge. The map reference only changes when a
 * headline really changed, so a re-publish of an identical value is a no-op and
 * subscribers do not re-render.
 */
import { useSyncExternalStore } from "react";

export type SectionHeadlineMap = ReadonlyMap<string, string>;

/** Shared empty map. Must be the SAME object every call (see builder-tree-bridge). */
const EMPTY: SectionHeadlineMap = new Map<string, string>();

let headlines: SectionHeadlineMap = EMPTY;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Record the live headline for a section. Pass an empty string for a section
 * whose headline was cleared - the empty value is meaningful (it makes the row
 * fall back to its cleaned section name, which is what the operator sees).
 */
export function publishSectionHeadline(
  sectionId: string,
  headline: string,
): void {
  if (!sectionId) return;
  const next = headline.trim();
  if (headlines.get(sectionId) === next) return;
  const map = new Map(headlines);
  map.set(sectionId, next);
  headlines = map;
  notify();
}

/** Drop every override. Called when the editor loads a different page. */
export function resetSectionHeadlines(): void {
  if (headlines === EMPTY || headlines.size === 0) return;
  headlines = EMPTY;
  notify();
}

export function subscribeSectionHeadlines(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSectionHeadlinesSnapshot(): SectionHeadlineMap {
  return headlines;
}

/** Server snapshot - the SHARED empty map (same object every call). */
export function getSectionHeadlinesServerSnapshot(): SectionHeadlineMap {
  return EMPTY;
}

/** Subscribe to the live per-section headlines. */
export function useSectionHeadlines(): SectionHeadlineMap {
  return useSyncExternalStore(
    subscribeSectionHeadlines,
    getSectionHeadlinesSnapshot,
    getSectionHeadlinesServerSnapshot,
  );
}
