"use client";

/**
 * useGuestInquiriesList — F4: load the guest's inquiries list while the panel
 * is open (feeds both the mini-mode thread switcher and the expanded left
 * pane). Extracted verbatim from MiniChatPanel.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. Cold-resume retry: see
 * guest-inquiries-retry.ts.
 */

import { useEffect, useState } from "react";

import type {
  GuestInquirySummary,
  ListGuestInquiriesCallback,
} from "@/lib/inquiry/guest-chat-contract";

import { nextListRetryDelayMs } from "./guest-inquiries-retry";

export function useGuestInquiriesList({
  open,
  expanded,
  onListGuestInquiries,
  tenantSlug,
  refreshKey,
  activeInquiryId = null,
  locale,
}: {
  open: boolean;
  expanded: boolean;
  onListGuestInquiries: ListGuestInquiriesCallback | null;
  tenantSlug: string;
  /**
   * W2-A: bump/change to force a refetch while the panel stays open. The panel
   * passes the active dock view so opening the Projects view always pulls a
   * fresh list (a draft created mid-session after the initial open would
   * otherwise never appear until the panel is reopened).
   */
  refreshKey?: unknown;
  /**
   * The panel's resumed/active inquiry id. On a COLD resume the first list
   * fetch can race the guest-session settle (cookie -> forwarded header) and
   * come back empty even though this inquiry exists. When that happens we know
   * the list is wrong (a resumed inquiry MUST be listable), so we retry once
   * shortly after. Also refetches when the id resolves from null -> real.
   */
  activeInquiryId?: string | null;
  /** The visitor's site locale, so project labels read in her language. */
  locale?: string | null;
}): GuestInquirySummary[] {
  const [inquiries, setInquiries] = useState<GuestInquirySummary[]>([]);
  useEffect(() => {
    if (!open || !onListGuestInquiries || !tenantSlug) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // Per effect run, so a changed active id starts a fresh, capped series.
    let attempt = 0;
    const load = async () => {
      try {
        const res = await onListGuestInquiries({ tenantSlug, ...(locale ? { locale } : {}) });
        if (cancelled || !res.ok) return;
        setInquiries(res.inquiries);
        // Cold-resume guard (see guest-inquiries-retry.ts): the resumed inquiry
        // must be in the list; if it is not, the session had not settled yet.
        const delay = nextListRetryDelayMs(attempt, activeInquiryId, res.inquiries.map((i) => i.inquiryId));
        if (delay !== null) {
          attempt += 1;
          retryTimer = setTimeout(() => {
            if (!cancelled) void load();
          }, delay);
        }
      } catch {
        /* transient */
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [open, expanded, onListGuestInquiries, tenantSlug, refreshKey, activeInquiryId, locale]);

  return inquiries;
}
