"use client";

/**
 * Tiny client bridge — receives a thread id from the deep-link page,
 * pins it into the talent shell's module-level "pending conversation"
 * slot, then router.replaces to the inbox so the URL doesn't keep the
 * id in history (next visit to /inbox stays clean).
 *
 * C8 — talent thread deep-link from inquiry-booking-improvement-plan.
 * Replaces the old hard-redirect that lost the id entirely.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { pinNextConversation } from "@/components/admin/shell/internal/messages";

export function PinThenRedirect({
  conversationId,
  tenantSlug,
  platformTalentRoutes = false,
}: {
  conversationId: string;
  tenantSlug?: string;
  platformTalentRoutes?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    pinNextConversation(conversationId);
    const target = platformTalentRoutes
      ? "/talent/inbox"
      : `/${tenantSlug}/talent/inbox`;
    router.replace(target);
  }, [conversationId, tenantSlug, platformTalentRoutes, router]);
  // Render a thin loading shell so the page isn't a flash of nothing
  // while the redirect resolves. The talent inbox shell takes over.
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: 40,
        textAlign: "center",
        fontFamily: '"Inter", system-ui, sans-serif',
        fontSize: 13,
        color: "rgba(11,11,13,0.55)",
      }}
    >
      Opening conversation…
    </div>
  );
}
