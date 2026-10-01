"use client";

import type { InquiryIntentActionState } from "@/app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions";
import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import { sentCopyKeys } from "@/lib/inquiry/reserve-slot-taken";

import { C, FONT, FONT_DISPLAY } from "./inquiry-drawer-tokens";

type SubmittedState = Extract<InquiryIntentActionState, { kind: "submitted" }>;

/** Shown in the drawer once the inquiry is sent. */
export function SubmittedView({
  state, agencyName, soloTalentName = null,
}: {
  state: SubmittedState;
  agencyName: string;
  soloTalentName?: string | null;
}) {
  const t = useT();
  const messagesHref =
    `/${state.tenantSlug}/client/messages`
    + `?inquiry=${encodeURIComponent(state.inquiryId)}&just_submitted=1`;

  // Guest follow-up CTA. The route is activation-dependent so the visitor
  // never lands on a dead end:
  //  • created  → a fresh account with no password yet → set-password flow.
  //  • matched  → an existing account → password sign-in.
  //  • unlinked → no account was linked → let them register.
  const guestEmailQuery = state.guestEmail
    ? `?email=${encodeURIComponent(state.guestEmail)}`
    : "";
  const guestCta =
    state.guestActivation === "matched"
      ? { href: `/login${guestEmailQuery}`, label: t("public.inquiryDrawer.guestCtaSignIn") }
      : state.guestActivation === "created"
        ? {
            href: `/forgot-password${guestEmailQuery}`,
            label: t("public.inquiryDrawer.guestCtaSetPassword"),
          }
        : { href: `/register${guestEmailQuery}`, label: t("public.inquiryDrawer.guestCtaCreate") };

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
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: C.card,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 10,
            padding: "14px 16px",
            textAlign: "left",
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink }}>
            {state.guestActivation === "matched"
              ? t("public.inquiryDrawer.submittedGuestMatchedTitle")
              : state.guestActivation === "created"
                ? t("public.inquiryDrawer.submittedGuestCreatedTitle")
                : t("public.inquiryDrawer.submittedGuestTrackTitle")}
          </div>
          <p style={{ margin: "5px 0 0", fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>
            {state.guestActivation === "created"
              ? state.guestEmail
                ? interpolate(t("public.inquiryDrawer.submittedGuestCreatedBodyEmail"), { email: state.guestEmail })
                : t("public.inquiryDrawer.submittedGuestCreatedBodyNoEmail")
              : state.guestActivation === "matched"
                ? state.guestEmail
                  ? interpolate(t("public.inquiryDrawer.submittedGuestMatchedBodyEmail"), { email: state.guestEmail })
                  : t("public.inquiryDrawer.submittedGuestMatchedBodyNoEmail")
                : state.guestEmail
                  ? interpolate(t("public.inquiryDrawer.submittedGuestUnlinkedBodyEmail"), { email: state.guestEmail })
                  : t("public.inquiryDrawer.submittedGuestUnlinkedBodyNoEmail")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <a href={guestCta.href} style={primaryLinkStyle}>
              {guestCta.label}
            </a>
          </div>
        </div>
      ) : (
        <a href={messagesHref} style={primaryLinkStyle}>
          {t("public.inquiryDrawer.viewInMessages")}
        </a>
      )}
    </div>
  );
}
