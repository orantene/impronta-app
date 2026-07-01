"use client";

/**
 * DashboardInquiriesLink — the quiet "See all your inquiries" footer link in the
 * guest-chat panel, shown ONLY to a signed-in CLIENT of this tenant.
 *
 * The href + "account" identity are resolved server-side at the launcher mount
 * (resolve-chat-viewer-identity), so an anonymous guest never receives a
 * dashboardHref and this component renders nothing for them (they cannot reach
 * the client dashboard). Extracted from MiniChatPanelColumn to hold that file
 * under the 800-line cap.
 *
 * House rule: accent-free neutral footer styling via the shared palette; the
 * label text comes from i18n (public.guestChat.viewAllInquiries).
 */

import { FONT_DISPLAY, paletteFor, type SurfaceMode } from "./mini-chat-styles";

export type DashboardInquiriesLinkProps = {
  /** `/{tenantSlug}/client/messages`; null/empty hides the link entirely. */
  dashboardHref: string | null;
  /** Localized label ("See all your inquiries"). */
  label: string;
  /** Dark/light surface variant for noir tenants. Default "light". */
  surfaceMode?: SurfaceMode;
};

export function DashboardInquiriesLink({
  dashboardHref,
  label,
  surfaceMode = "light",
}: DashboardInquiriesLinkProps) {
  if (!dashboardHref) return null;
  const C = paletteFor(surfaceMode);
  return (
    <a
      href={dashboardHref}
      style={{
        display: "block",
        textAlign: "center",
        padding: "8px 14px",
        borderTop: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        color: C.inkMuted,
        fontFamily: FONT_DISPLAY,
        fontSize: 11.5,
        fontWeight: 600,
        textDecoration: "none",
      }}
    >
      {label}
    </a>
  );
}
