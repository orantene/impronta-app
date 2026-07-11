"use client";

/**
 * useGuestInquiriesList — F4: load the guest's inquiries list while the panel
 * is open (feeds both the mini-mode thread switcher and the expanded left
 * pane). Extracted verbatim from MiniChatPanel.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. No logic changes.
 */

import { useEffect, useRef, useState } from "react";

import type {
  GuestInquirySummary,
  ListGuestInquiriesCallback,
} from "@/lib/inquiry/guest-chat-contract";

export function useGuestInquiriesList({
  open,
  expanded,
  onListGuestInquiries,
  tenantSlug,
  refreshKey,
  activeInquiryId = null,
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
}): GuestInquirySummary[] {
  const [inquiries, setInquiries] = useState<GuestInquirySummary[]>([]);
  // One retry budget per (open) session, so a genuinely empty guest never loops.
  const retriedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      retriedRef.current = false;
      return;
    }
    if (!onListGuestInquiries || !tenantSlug) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const res = await onListGuestInquiries({ tenantSlug });
        if (cancelled || !res.ok) return;
        setInquiries(res.inquiries);
        // Cold-resume guard: resumed into an inquiry but the list came back
        // empty -> the session probably was not settled yet. Retry once.
        if (
          res.inquiries.length === 0 &&
          activeInquiryId &&
          !retriedRef.current
        ) {
          retriedRef.current = true;
          retryTimer = setTimeout(() => {
            if (!cancelled) void load();
          }, 500);
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
  }, [open, expanded, onListGuestInquiries, tenantSlug, refreshKey, activeInquiryId]);

  return inquiries;
}
