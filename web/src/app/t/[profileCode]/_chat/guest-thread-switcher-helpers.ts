/**
 * Pure helpers for GuestThreadSwitcher (Phase 5 multi-inquiry switcher).
 * Extracted verbatim from GuestThreadSwitcher.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. No logic changes.
 */

import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";

export function formatRelTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(diffMs / 3_600_000);
    const days = Math.floor(diffMs / 86_400_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, {
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
