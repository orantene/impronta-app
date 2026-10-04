"use client";

/**
 * Publish staff "viewing" presence on the open inquiry's private thread so
 * the guest Hablar dock can paint a real "lo está viendo" line (AUD-009).
 * No-op when no thread or no session user.
 */

import { useThreadPresence } from "@/lib/realtime/presence";

export function useStaffInquiryPresence(args: {
  inquiryId: string | null;
  userId: string | null;
  displayName?: string | null;
}): void {
  const { inquiryId, userId, displayName } = args;
  useThreadPresence({
    channelKey: inquiryId && userId ? `inquiry:${inquiryId}:private` : null,
    userId: userId ?? "",
    displayName: displayName?.trim() || "Staff",
    role: "staff",
  });
}
