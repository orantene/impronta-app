"use client";

/**
 * GuestActivationCard — TUL-1994 / TUL-1191: the client-signup entry point a
 * GUEST gets after an unauthenticated inquiry is submitted.
 *
 * Before this, only the inquiry drawer (`InquirySubmittedView`) rendered this
 * block; the `/contact` page runs the exact same canonical guest path
 * (`submitInquiry` + `ensureGuestClientByEmail`) but dropped the activation
 * result on the floor, so a guest who wrote in through Contact had no way
 * back into their inquiry and no path to create a real client account — the
 * chat/inbox equivalent dead-ended. This is the ONE signup entry point,
 * extracted so every guest-inquiry surface reuses it instead of inventing its
 * own.
 *
 * `activation` is the `ensureGuestClientByEmail` provisioning result:
 *   matched  → an email that already has an account (unverified)  → sign in
 *   created  → a fresh account was started for this email          → set a password
 *   unlinked → no account exists / not safely linkable yet         → register
 * (null/undefined — a guest with no email on file — is treated as unlinked,
 * same as the drawer always has.)
 */

import { usePublicT } from "@/i18n/use-public-t";
import { interpolate } from "@/i18n/interpolate";

import { C, FONT, FONT_DISPLAY, primaryLinkStyle } from "./inquiry-drawer-tokens";

export type GuestActivationStatus = "matched" | "created" | "unlinked";

export function GuestActivationCard({
  activation,
  email,
}: {
  activation: GuestActivationStatus | null | undefined;
  email: string | null;
}) {
  const t = usePublicT();
  const resolved: GuestActivationStatus =
    activation === "matched" || activation === "created" ? activation : "unlinked";
  const guestEmailQuery = email ? `?email=${encodeURIComponent(email)}` : "";

  const cta =
    resolved === "matched"
      ? { href: `/login${guestEmailQuery}`, label: t("public.inquiryDrawer.guestCtaSignIn") }
      : resolved === "created"
        ? {
            href: `/forgot-password${guestEmailQuery}`,
            label: t("public.inquiryDrawer.guestCtaSetPassword"),
          }
        : { href: `/register${guestEmailQuery}`, label: t("public.inquiryDrawer.guestCtaCreate") };

  const title =
    resolved === "matched"
      ? t("public.inquiryDrawer.submittedGuestMatchedTitle")
      : resolved === "created"
        ? t("public.inquiryDrawer.submittedGuestCreatedTitle")
        : t("public.inquiryDrawer.submittedGuestTrackTitle");

  const body =
    resolved === "created"
      ? email
        ? interpolate(t("public.inquiryDrawer.submittedGuestCreatedBodyEmail"), { email })
        : t("public.inquiryDrawer.submittedGuestCreatedBodyNoEmail")
      : resolved === "matched"
        ? email
          ? interpolate(t("public.inquiryDrawer.submittedGuestMatchedBodyEmail"), { email })
          : t("public.inquiryDrawer.submittedGuestMatchedBodyNoEmail")
        : email
          ? interpolate(t("public.inquiryDrawer.submittedGuestUnlinkedBodyEmail"), { email })
          : t("public.inquiryDrawer.submittedGuestUnlinkedBodyNoEmail");

  return (
    <div
      data-guest-activation-card=""
      style={{
        width: "100%",
        maxWidth: 420,
        background: C.card,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 10,
        padding: "14px 16px",
        textAlign: "left",
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, fontFamily: FONT_DISPLAY }}>{title}</div>
      <p style={{ margin: "5px 0 0", fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>{body}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        <a href={cta.href} style={primaryLinkStyle} data-guest-activation-cta="">
          {cta.label}
        </a>
      </div>
    </div>
  );
}
