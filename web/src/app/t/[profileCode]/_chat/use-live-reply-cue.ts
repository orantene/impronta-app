"use client";

/**
 * use-live-reply-cue: the launcher's unread cue while the chat is CLOSED.
 *
 * The server flag (`unreadCoordinatorReply`) is read once when the page loads,
 * so a reply that arrived after that never lit the launcher (e2e P1: "no unread
 * cue after a reply arrives"). While the panel is closed and the visitor has a
 * conversation, ask for her list now and then; an inquiry whose newest message
 * is not hers and is newer than the moment she last looked is a fresh reply.
 */

import { useEffect, useRef, useState } from "react";

import type { GuestInquirySummary, ListGuestInquiriesCallback } from "@/lib/inquiry/guest-chat-contract";

export const REPLY_CUE_FIRST_CHECK_MS = 4_000;
export const REPLY_CUE_POLL_MS = 45_000;

/** True when some inquiry's newest message is from the other side and newer than `sinceMs`. */
export function hasFreshReply(inquiries: readonly Pick<GuestInquirySummary, "lastMessageAuthor" | "lastMessageAt">[], sinceMs: number): boolean {
  return inquiries.some((i) => {
    if (!i.lastMessageAt || !i.lastMessageAuthor || i.lastMessageAuthor === "guest") return false;
    const at = Date.parse(i.lastMessageAt);
    return Number.isFinite(at) && at > sinceMs;
  });
}

export function useLiveReplyCue({
  open,
  enabled,
  tenantSlug,
  locale,
  onList,
}: {
  open: boolean;
  /** She has a conversation (or may have one): no point asking before. */
  enabled: boolean;
  tenantSlug: string;
  locale?: string | null;
  onList: ListGuestInquiriesCallback | null;
}): boolean {
  const [fresh, setFresh] = useState(false);
  // The moment she last looked: page load, then every time she closes the panel.
  const sinceRef = useRef<number>(Date.now());
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setFresh(false);
    } else if (wasOpen.current) {
      wasOpen.current = false;
      sinceRef.current = Date.now();
    }
  }, [open]);

  useEffect(() => {
    if (open || !enabled || !onList || !tenantSlug) return;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await onList({ tenantSlug, ...(locale ? { locale } : {}) });
        if (cancelled || !res.ok) return;
        if (hasFreshReply(res.inquiries, sinceRef.current)) setFresh(true);
      } catch {
        /* transient */
      }
    };
    const first = setTimeout(() => void check(), REPLY_CUE_FIRST_CHECK_MS);
    const every = setInterval(() => void check(), REPLY_CUE_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(every);
    };
  }, [open, enabled, onList, tenantSlug, locale]);

  return fresh;
}
