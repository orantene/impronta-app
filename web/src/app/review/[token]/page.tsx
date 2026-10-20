import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";

import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadReviewInviteByToken } from "@/lib/reviews/review-token-actions";
import {
  fillCopy,
  formatReviewDate,
  getReviewPageCopy,
  resolveReviewLocale,
  type ReviewPageCopy,
} from "@/lib/reviews/review-page-copy";

import { ReviewTokenForm } from "./ReviewTokenForm";

/**
 * Public review-invite landing page — /review/{invite_token}.
 *
 * Reached from the emailed invite a talent (or tenant staff) sends a past
 * client. No workspace chrome; a centered card on a faint-cool ground matching
 * the review family (blue accent, gold stars, Inter type).
 *
 * States:
 *   - invalid / expired token → a friendly, non-leaky message.
 *   - needs-auth → the invite is live but no matching session is present; prompt
 *     sign-in via /login?next=/review/{token}. We never trust the token for
 *     identity; the actual auth-match happens again server-side on submit.
 *   - form → a live invite with a matching signed-in client; render the STANDING
 *     review form with the talent + event context.
 *
 * force-dynamic + noindex: this is a per-recipient token URL, never cached or
 * indexed.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leave a review | Deja tu reseña",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.6)",
  ground: "#F5F6F9",
  cardBg: "#ffffff",
  borderSoft: "rgba(24,24,27,0.10)",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
} as const;

/** Page shell: centered card on a faint-cool ground, no workspace chrome. */
function Shell({ children, t, lang }: { children: ReactNode; t: ReviewPageCopy; lang: string }) {
  const page: CSSProperties = {
    minHeight: "100dvh",
    background: C.ground,
    fontFamily: FONT,
    color: C.ink,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "48px 20px 64px",
    boxSizing: "border-box",
  };
  const inner: CSSProperties = { width: "100%", maxWidth: 480 };
  return (
    <main style={page} lang={lang}>
      <div style={inner}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.2,
            color: C.inkMuted,
            marginBottom: 20,
            textAlign: "center",
          }}
        >
          {PLATFORM_BRAND.name}
        </div>
        {children}
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: C.inkDim, lineHeight: 1.5 }}>
          {t.footer}
        </div>
      </div>
    </main>
  );
}

/** A simple message card for the invalid / expired terminal states. */
function MessageCard({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 14,
        padding: "28px 24px",
        textAlign: "center",
        boxShadow: "0 1px 2px rgba(11,11,13,0.04)",
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: -0.2, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

export default async function ReviewInvitePage({
  params,
}: {
  params: Params;
}) {
  const { token } = await params;

  const acceptLanguage = (await headers()).get("accept-language");
  const invite = await loadReviewInviteByToken(token, acceptLanguage);
  // Before an invite resolves there is no booking language: the browser's decides.
  const lang = invite.kind === "ok" ? invite.locale : resolveReviewLocale({ acceptLanguage });
  const t = getReviewPageCopy(lang);

  // ─── Invalid token ───────────────────────────────────────────────────
  if (invite.kind === "invalid") {
    return (
      <Shell t={t} lang={lang}>
        <MessageCard title={t.invalidTitle} body={t.invalidBody} />
      </Shell>
    );
  }

  // ─── Expired / already used ──────────────────────────────────────────
  if (invite.kind === "expired") {
    return (
      <Shell t={t} lang={lang}>
        <MessageCard title={t.expiredTitle} body={t.expiredBody} />
      </Shell>
    );
  }

  // ─── Live invite ─────────────────────────────────────────────────────
  const eventDate = formatReviewDate(invite.eventDate, lang);
  // The loader's English fallback label reads "the talent"; say it in the page language.
  const talentLabel = invite.talentName === "the talent" ? t.theTalent : invite.talentName;
  const loginHref = `/login?next=${encodeURIComponent(`/review/${token}`)}`;

  // Server-side auth check to decide the initial state. We NEVER trust the
  // token for identity: the submit action re-validates the match. Here we just
  // pick whether to render the form directly or the sign-in prompt.
  const session = await getCachedActorSession();
  const user = session.user;
  const inviteEmail = (invite.invitedEmail ?? "").trim().toLowerCase();
  const sessionEmail = (user?.email ?? "").trim().toLowerCase();
  const matchesClientId =
    !!user && !!invite.clientUserId && invite.clientUserId === user.id;
  const matchesEmail =
    !!user &&
    !invite.clientUserId &&
    inviteEmail.length > 0 &&
    sessionEmail.length > 0 &&
    inviteEmail === sessionEmail;
  const authMatched = matchesClientId || matchesEmail;

  // Honest labeling: only a payer-linked, booking-tied invite can produce a
  // "Verified" review. When the invite has no booking, we never claim verified.
  const verifiable = !!invite.bookingId;

  const contextCard = (
    <div
      style={{
        background: C.accentSoft,
        border: "1px solid rgba(29,78,216,0.16)",
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: C.accent, marginBottom: 6 }}>
        {t.workedWith}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
        {talentLabel}
      </div>
      {/* G2: the service the review is about */}
      {invite.serviceName && (
        <div style={{ fontSize: 13, color: C.ink, marginTop: 4, fontWeight: 600 }}>
          {t.service}: {invite.serviceName}
        </div>
      )}
      {(invite.eventTitle || eventDate) && (
        <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 4 }}>
          {invite.eventTitle && invite.eventTitle !== invite.serviceName ? invite.eventTitle : null}
          {invite.eventTitle && invite.eventTitle !== invite.serviceName && eventDate ? " · " : ""}
          {eventDate}
        </div>
      )}
      {invite.message && (
        <div
          style={{
            fontSize: 12.5,
            color: C.ink,
            lineHeight: 1.55,
            marginTop: 10,
            padding: "10px 12px",
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 9,
          }}
        >
          <span style={{ display: "block", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.2, textTransform: "uppercase", color: C.inkDim, marginBottom: 4 }}>
            {fillCopy(t.noteFrom, { name: talentLabel })}
          </span>
          {invite.message}
        </div>
      )}
    </div>
  );

  // Guest path: an EMAIL-only invite (not tied to a known account) opened
  // without a matching session. Possession of the single-use, booking-bound
  // token proves inbox access, so a no-account guest may review — as an honest,
  // UNVERIFIED "Invited review". A known-account invite still requires sign-in.
  const guestEligible =
    !authMatched && !invite.clientUserId && inviteEmail.length > 0;

  // Needs-auth: a known-account invite opened without the matching session.
  if (!authMatched && !guestEligible) {
    return (
      <Shell t={t} lang={lang}>
        {contextCard}
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            padding: "22px 22px",
            textAlign: "center",
            boxShadow: "0 1px 2px rgba(11,11,13,0.04)",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, letterSpacing: -0.2, marginBottom: 8 }}>
            {fillCopy(t.askedTitle, { name: talentLabel })}
          </div>
          <div style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.6, marginBottom: 16 }}>
            {t.askedBody}
          </div>
          <Link
            href={loginHref}
            style={{
              display: "inline-block",
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: C.accent,
              textDecoration: "none",
              borderRadius: 9,
              fontFamily: FONT,
            }}
          >
            {t.signInContinue}
          </Link>
        </div>
      </Shell>
    );
  }

  // Matched (verified-capable) OR a guest reviewing an email-only invite. A
  // guest review can never be payment-verified, so it never claims "Verified".
  return (
    <Shell t={t} lang={lang}>
      {contextCard}
      <ReviewTokenForm
        token={invite.token}
        talentName={talentLabel}
        talentProfileCode={invite.talentProfileCode}
        verifiable={verifiable && !guestEligible}
        guestMode={guestEligible}
        bookingId={invite.bookingId}
        talentProfileId={invite.talentProfileId}
        t={t}
        serviceName={invite.serviceName}
      />
    </Shell>
  );
}
