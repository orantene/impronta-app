/**
 * Guest-inquiry confirmation page (E.4).
 *
 * Persistent success page shown after a guest (unauthenticated) inquiry is
 * submitted. Replaces the prior pattern that dropped the user back at the
 * directory with a sheet-modal that vanished on reload.
 *
 * Query params:
 *   - email   — copy receipt email shown to user
 *   - agency  — display name of the agency the inquiry went to
 *   - id      — inquiry id, propagated to register CTA for post-signup link
 *   - activation — optional "magic-link" token for one-click account claim
 */

import type { Metadata } from "next";
import Link from "next/link";

interface PageProps {
  searchParams: Promise<{
    email?: string;
    agency?: string;
    id?: string;
    activation?: string;
  }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inquiry sent · Tulala",
  description: "Your inquiry has been sent — the agency will be in touch.",
  robots: { index: false, follow: false },
};

export default async function InquirySentPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const email = sp.email?.trim() ?? null;
  const agency = sp.agency?.trim() || "the agency";
  const inquiryId = sp.id?.trim() ?? null;
  const activation = sp.activation?.trim() ?? null;

  const registerHref = (() => {
    const q = new URLSearchParams();
    if (email) q.set("email", email);
    if (inquiryId) q.set("inquiry", inquiryId);
    if (activation) q.set("activation", activation);
    const qs = q.toString();
    return qs ? `/register?${qs}` : "/register";
  })();

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#FAFAF7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 16px",
        fontFamily: '"Inter", system-ui, sans-serif',
        color: "#0B0B0D",
      }}
    >
      <main
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#fff",
          border: "1px solid rgba(24,24,27,0.06)",
          borderRadius: 16,
          padding: "36px 32px 28px",
          boxShadow: "0 12px 36px rgba(11,11,13,0.06)",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "rgba(15,79,62,0.08)",
            color: "#0F4F3E",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 20,
          }}
        >
          ✓
        </div>

        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Your inquiry has been sent to {agency}
        </h1>

        {email ? (
          <p
            style={{
              fontSize: 14,
              color: "rgba(11,11,13,0.62)",
              lineHeight: 1.55,
              marginTop: 12,
              marginBottom: 0,
            }}
          >
            We sent a confirmation to{" "}
            <span style={{ color: "#0B0B0D", fontWeight: 500 }}>{email}</span>.
            Most agencies reply within an hour during business hours.
          </p>
        ) : (
          <p
            style={{
              fontSize: 14,
              color: "rgba(11,11,13,0.62)",
              lineHeight: 1.55,
              marginTop: 12,
              marginBottom: 0,
            }}
          >
            Most agencies reply within an hour during business hours.
          </p>
        )}

        <div
          style={{
            marginTop: 28,
            padding: 18,
            background: "rgba(15,79,62,0.04)",
            border: "1px solid rgba(15,79,62,0.10)",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 600,
              color: "#093328",
              marginBottom: 4,
            }}
          >
            Track replies in real time
          </div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(9,51,40,0.78)",
              lineHeight: 1.55,
            }}
          >
            Create a free Tulala account to see the agency&apos;s reply, message
            them back, and manage your booking from one place.
          </div>
          <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link
              href={registerHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 18px",
                background: "#0F4F3E",
                color: "#fff",
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Create account →
            </Link>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 18px",
                background: "transparent",
                color: "#0B0B0D",
                border: "1px solid rgba(24,24,27,0.12)",
                borderRadius: 9,
                fontSize: 13.5,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Back to homepage
            </Link>
          </div>
        </div>

        <p
          style={{
            fontSize: 11.5,
            color: "rgba(11,11,13,0.45)",
            marginTop: 24,
            marginBottom: 0,
            textAlign: "center",
          }}
        >
          Powered by Tulala · We respect your inbox; no marketing email.
        </p>
      </main>
    </div>
  );
}
