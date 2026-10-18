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

/** Title the server stores for a draft nobody has named yet. */
export const UNTITLED_DRAFT_TITLE = "Sin título";

/**
 * True for a draft the owner never wrote in: stored placeholder title, no
 * excerpt or body, no schedule and nothing set in settings. Opening the writer
 * has to create a row (the writer addresses a post by id), so these rows exist
 * after a click with no typing. They are hidden from the list and reused by the
 * next "new post" click instead of piling up (TUL-1249).
 */
export function isPristineDraft(input: {
  status: string;
  title: string | null;
  excerpt: string | null;
  blockCount: number;
  scheduledPublishAt: string | null;
  isUnlisted?: boolean | null;
  isFeatured?: boolean | null;
  expiresAt?: string | null;
  categoryId?: string | null;
  relatedOfferingId?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  coverImageUrl?: string | null;
  ogImageUrl?: string | null;
}): boolean {
  const blank = (v: string | null | undefined) => !v || v.trim() === "";
  return (
    input.status === "draft" &&
    (blank(input.title) || input.title?.trim() === UNTITLED_DRAFT_TITLE) &&
    blank(input.excerpt) &&
    input.blockCount === 0 &&
    !input.scheduledPublishAt &&
    !input.isUnlisted &&
    !input.isFeatured &&
    !input.expiresAt &&
    !input.categoryId &&
    !input.relatedOfferingId &&
    blank(input.metaTitle) &&
    blank(input.metaDescription) &&
    blank(input.coverImageUrl) &&
    blank(input.ogImageUrl)
  );
}
