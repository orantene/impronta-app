"use client";

import type { InquiryIntentActionState } from "@/app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions";
import { interpolate } from "@/i18n/interpolate";
import { usePublicT } from "@/i18n/use-public-t";
import { sentCopyKeys } from "@/lib/inquiry/reserve-slot-taken";

import { GuestActivationCard } from "./GuestActivationCard";
import { C, FONT, FONT_DISPLAY, primaryLinkStyle } from "./inquiry-drawer-tokens";

type SubmittedState = Extract<InquiryIntentActionState, { kind: "submitted" }>;

/** Shown in the drawer once the inquiry is sent. */
export function SubmittedView({
  state, agencyName, soloTalentName = null, followUpOnSite = false,
}: {
  state: SubmittedState;
  agencyName: string;
  soloTalentName?: string | null;
  followUpOnSite?: boolean;
}) {
  const t = usePublicT();
  const messagesHref = followUpOnSite
    ? `/c/${encodeURIComponent(state.inquiryId)}`
    : `/${state.tenantSlug}/client/messages`
      + `?inquiry=${encodeURIComponent(state.inquiryId)}&just_submitted=1`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 14,
        padding: "28px 12px",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          background: C.successSoft,
          color: C.success,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 26,
        }}
      >
        ✓
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, fontFamily: FONT_DISPLAY }}>
          {t("public.inquiryDrawer.submittedTitle")}
        </div>
        <p style={{ margin: "6px auto 0", fontSize: 13, color: C.inkMuted, maxWidth: 380, lineHeight: 1.5 }}>
          {interpolate(t(sentCopyKeys(soloTalentName).body), { agency: agencyName, talent: soloTalentName ?? agencyName })}
        </p>
      </div>

      {state.isGuest ? (
        <GuestActivationCard activation={state.guestActivation} email={state.guestEmail ?? null} />
      ) : (
        <a href={messagesHref} style={primaryLinkStyle}>
          {t("public.inquiryDrawer.viewInMessages")}
        </a>
      )}
    </div>
  );
}
