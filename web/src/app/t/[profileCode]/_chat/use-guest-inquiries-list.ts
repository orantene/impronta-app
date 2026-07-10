"use client";

/**
 * useGuestInquiriesList — F4: load the guest's inquiries list while the panel
 * is open (feeds both the mini-mode thread switcher and the expanded left
 * pane). Extracted verbatim from MiniChatPanel.tsx (W1-A decomposition
 * pre-pass) to keep that file under the 800-line cap. No logic changes.
 */

import { useEffect, useState } from "react";

import type {
  GuestInquirySummary,
  ListGuestInquiriesCallback,
} from "@/lib/inquiry/guest-chat-contract";

export function useGuestInquiriesList({
  open,
  expanded,
  onListGuestInquiries,
  tenantSlug,
}: {
  open: boolean;
  expanded: boolean;
  onListGuestInquiries: ListGuestInquiriesCallback | null;
  tenantSlug: string;
}): GuestInquirySummary[] {
  const [inquiries, setInquiries] = useState<GuestInquirySummary[]>([]);

  useEffect(() => {
    if (!open || !onListGuestInquiries || !tenantSlug) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await onListGuestInquiries({ tenantSlug });
        if (!cancelled && res.ok) setInquiries(res.inquiries);
      } catch {
        /* transient */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, expanded, onListGuestInquiries, tenantSlug]);

  return inquiries;
}
