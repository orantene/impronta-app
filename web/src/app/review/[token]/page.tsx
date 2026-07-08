import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadReviewInviteByToken } from "@/lib/reviews/review-token-actions";

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
  title: "Leave a review",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

const FONT = '"Inter", system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.40)",
  ground: "#F5F6F9",
  cardBg: "#ffffff",
  borderSoft: "rgba(24,24,27,0.10)",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
} as const;

/** Format an ISO event date as a short, locale-neutral label. */
function formatEventDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Page shell: centered card on a faint-cool ground, no workspace chrome. */
function Shell({ children }: { children: ReactNode }) {
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
    <main style={page}>
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
          Reviews are published on the talent&rsquo;s page. You can only review
          your own bookings.
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

  const invite = await loadReviewInviteByToken(token);

  // ─── Invalid token ───────────────────────────────────────────────────
  if (invite.kind === "invalid") {
    return (
      <Shell>
        <MessageCard
          title="This review link isn't valid"
          body="The link may be mistyped or was never issued. If you were asked to leave a review, please open the most recent invite email."
        />
      </Shell>
    );
  }

  // ─── Expired / already used ──────────────────────────────────────────
  if (invite.kind === "expired") {
    return (
      <Shell>
        <MessageCard
          title="This review link has expired"
          body="It may have already been used, or the window to respond has passed. If you'd still like to leave a review, ask for a fresh invite."
        />
      </Shell>
    );
  }

  // ─── Live invite ─────────────────────────────────────────────────────
  const eventDate = formatEventDate(invite.eventDate);
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
        You worked with
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
        {invite.talentName}
      </div>
      {(invite.eventTitle || eventDate) && (
        <div style={{ fontSize: 12.5, color: C.inkMuted, marginTop: 4 }}>
          {invite.eventTitle}
          {invite.eventTitle && eventDate ? " · " : ""}
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
            A note from {invite.talentName}
          </span>
          {invite.message}
        </div>
      )}
    </div>
  );

  // Needs-auth: no matching session — prompt sign-in first.
  if (!authMatched) {
    return (
      <Shell>
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
            {invite.talentName} asked you for a review
          </div>
          <div style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.6, marginBottom: 16 }}>
            To keep reviews honest, we confirm it&rsquo;s really you before
            publishing. Sign in with the account this invite was sent to, then
            leave your review.
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
            Sign in and continue
          </Link>
        </div>
      </Shell>
    );
  }

  // Matched — render the form.
  return (
    <Shell>
      {contextCard}
      <ReviewTokenForm
        token={invite.token}
        talentName={invite.talentName}
        talentProfileCode={invite.talentProfileCode}
        verifiable={verifiable}
      />
    </Shell>
  );
}
