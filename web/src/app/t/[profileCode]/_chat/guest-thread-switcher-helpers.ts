/**
 * Pure helpers for GuestThreadSwitcher (Phase 5 multi-inquiry switcher).
 * Extracted verbatim from GuestThreadSwitcher.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. No logic changes.
 */

import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";

/** "5m ago" in the visitor's language (the page's `lang` when no locale is passed). */
export function relTimeWords(unit: "now" | "m" | "h" | "d", n: number, locale: string): string {
  if (locale.toLowerCase().startsWith("es")) {
    return unit === "now" ? "ahora" : unit === "m" ? `hace ${n} min` : unit === "h" ? `hace ${n} h` : `hace ${n} d`;
  }
  if (locale.toLowerCase().startsWith("fr")) {
    return unit === "now" ? "à l'instant" : unit === "m" ? `il y a ${n} min` : unit === "h" ? `il y a ${n} h` : `il y a ${n} j`;
  }
  return unit === "now" ? "just now" : `${n}${unit} ago`;
}

export function formatRelTime(iso: string | null, localeArg?: string): string {
  if (!iso) return "";
  const locale = localeArg ?? (typeof document !== "undefined" ? document.documentElement.lang : "") ?? "";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(diffMs / 86_400_000);
    if (minutes < 1) return relTimeWords("now", 0, locale);
    if (minutes < 60) return relTimeWords("m", minutes, locale);
    if (hours < 24) return relTimeWords("h", hours, locale);
    if (days < 7) return relTimeWords("d", days, locale);
    return new Date(iso).toLocaleDateString(locale || undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function talentInitial(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

/**
 * Returns true when the last message on this inquiry is inbound (not from the
 * guest) AND arrived after the panel's last-seen cursor for that inquiry.
 */
export function hasNewInbound(
  summary: GuestInquirySummary,
  seenAtByInquiry: Record<string, string>,
): boolean {
  if (!summary.lastMessageAt) return false;
  const seenAt = seenAtByInquiry[summary.inquiryId];
  if (seenAt && summary.lastMessageAt <= seenAt) return false;
  // unreadHint is always false from the server (set by panel client-side).
  // Here we just check if there's a newer lastMessageAt than seenAt.
  return true;
}
