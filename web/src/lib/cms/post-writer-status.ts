/**
 * post-writer-status.ts — the four statuses the writer shows (Borrador,
 * Programado, Publicado, Oculto) mapped to and from the stored columns.
 *
 *   Borrador   status=draft, no schedule
 *   Programado status=draft, scheduled_publish_at set (the cron publishes it)
 *   Publicado  status=published, is_unlisted=false
 *   Oculto     status=published, is_unlisted=true (link works, not listed)
 *
 * Pure and client-safe. Going live (Publicado, Oculto from a draft, Programado)
 * is a publish intent the server gates; this file only translates shapes.
 */
import type { PostSettingsPatch } from "@/lib/cms/posts-writer";

export type PostUiStatus = "draft" | "scheduled" | "published" | "hidden";

export function derivePostUiStatus(input: {
  status: string;
  isUnlisted: boolean;
  scheduledPublishAt: string | null;
}): PostUiStatus {
  if (input.status === "published") return input.isUnlisted ? "hidden" : "published";
  return input.scheduledPublishAt ? "scheduled" : "draft";
}

/** Stored columns for a chosen status. Programado needs its date (ISO). */
export function postUiStatusToPatch(
  ui: PostUiStatus,
  scheduledPublishAt: string | null,
): PostSettingsPatch {
  switch (ui) {
    case "draft":
      return { status: "draft", scheduled_publish_at: null, is_unlisted: false };
    case "scheduled":
      return { status: "draft", scheduled_publish_at: scheduledPublishAt, is_unlisted: false };
    case "published":
      return { status: "published", scheduled_publish_at: null, is_unlisted: false };
    case "hidden":
      return { status: "published", scheduled_publish_at: null, is_unlisted: true };
  }
}

/** `<input type="datetime-local">` value for an ISO instant, in the browser's zone. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO instant for a `datetime-local` value; null when empty or invalid. */
export function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
