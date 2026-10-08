"use client";

/**
 * TUL-52 C: ONE source of truth for "draft vs published" in the talent
 * builder. The draft chip owns the server diff (`loadTalentGoLiveAction`); the
 * top-bar save control used to guess from timestamps and so said "Draft saved"
 * while the chip said "Live". The chip publishes here, the save control reads.
 */
import { useSyncExternalStore } from "react";

export type TalentDraftStatus = "unknown" | "draft" | "published";

let current: TalentDraftStatus = "unknown";
const listeners = new Set<() => void>();

export function resolveTalentDraftStatus(
  summary: { unpublishedCount: number; firstPublish: unknown } | null,
): TalentDraftStatus {
  if (!summary) return "unknown";
  return summary.unpublishedCount === 0 && !summary.firstPublish ? "published" : "draft";
}

export function publishTalentDraftStatus(next: TalentDraftStatus): void {
  if (current === next) return;
  current = next;
  for (const l of listeners) l();
}

export function getTalentDraftStatus(): TalentDraftStatus {
  return current;
}

export function useTalentDraftStatus(): TalentDraftStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    getTalentDraftStatus,
    () => "unknown" as TalentDraftStatus,
  );
}

/** Words for the save control: "published" overrides the stale "Draft saved". */
export function saveStatusWords(
  status: TalentDraftStatus,
  state: "saving" | "dirty" | "saved",
): "saving" | "dirty" | "published" | "draftSaved" {
  if (state !== "saved") return state;
  return status === "published" ? "published" : "draftSaved";
}

/**
 * TUL-70: the moment the draft changes (edit, delete, undo) the last server
 * diff is stale, so "published" must not be shown until a fresh diff lands.
 * Returns the status to show: "published" only survives when no edit is pending.
 */
export function statusWhileEditPending(
  status: TalentDraftStatus,
  editPending: boolean,
): TalentDraftStatus {
  return editPending && status === "published" ? "unknown" : status;
}

/** Latest-wins guard so a slow, older diff can't overwrite a newer one. */
export function createLatestGuard(): { next(): number; isLatest(id: number): boolean } {
  let latest = 0;
  return {
    next: () => ++latest,
    isLatest: (id) => id === latest,
  };
}
