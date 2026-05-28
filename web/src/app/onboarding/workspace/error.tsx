"use client";

// Onboarding · Workspace · Route-segment error boundary.
//
// Why this exists: `/onboarding/workspace` is the trampoline that turns a
// signed-in user + their saas_marketing_signups lead row into a provisioned
// tenant (and a Stripe Checkout redirect for paid tiers). When that pipeline
// throws — Supabase blip, Stripe outage, schema drift — we previously fell
// through to the app-wide `app/error.tsx`, whose "Retry" sends the user
// home and whose "home" link is `/`. That's the wrong recovery surface here:
// the user already has a lead, the provisioner is idempotent (it reuses an
// already-claimed tenant or an owned free workspace by user_id), so the
// right "try again" is to re-enter `/onboarding/workspace?lead=<id>` itself.
//
// This boundary also surfaces the lead ID to the user so they can copy it
// into a support email if the retry keeps failing.

import Link from "next/link";
import { useEffect, useState } from "react";
import { logServerError } from "@/lib/server/safe-error";

const SUPPORT_EMAIL = "hello@tulala.digital";

export default function OnboardingWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [leadId, setLeadId] = useState("");

  useEffect(() => {
    logServerError("onboarding/workspace/error.tsx", error);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setLeadId(params.get("lead")?.trim() ?? "");
    }
  }, [error]);

  const retryHref = leadId
    ? `/onboarding/workspace?lead=${encodeURIComponent(leadId)}`
    : `/get-started`;

  const supportSubject = encodeURIComponent(
    leadId
      ? `Workspace setup failed — lead ${leadId}`
      : `Workspace setup failed`,
  );
  const supportBody = encodeURIComponent(
    [
      `Hi Tulala team,`,
      ``,
      `I hit a snag setting up my workspace.`,
      leadId ? `Lead reference: ${leadId}` : null,
      error?.digest ? `Error reference: ${error.digest}` : null,
      ``,
      `(Please add any details about what happened just before this email.)`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
  );
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${supportSubject}&body=${supportBody}`;

  return (
    <div
      style={{
        minHeight: "70vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "#FAFAF7",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "#ffffff",
          border: "1px solid rgba(24,24,27,0.10)",
          borderRadius: 16,
          padding: "32px 32px",
        }}
      >
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(11,11,13,0.38)",
            letterSpacing: 0.8,
            textTransform: "uppercase" as const,
            margin: 0,
          }}
        >
          Workspace setup
        </p>
        <h1
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 26,
            fontWeight: 600,
            color: "#0B0B0D",
            letterSpacing: -0.4,
            marginTop: 12,
            marginBottom: 0,
            lineHeight: 1.2,
          }}
        >
          We hit a snag setting up your workspace
        </h1>
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 13.5,
            color: "rgba(11,11,13,0.65)",
            lineHeight: 1.55,
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          Your account is safe and nothing has been charged yet. Try again —
          if it keeps failing, send us the reference below and we&apos;ll finish
          setup by hand.
        </p>

        {leadId || error?.digest ? (
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              color: "rgba(11,11,13,0.45)",
              marginTop: 14,
              padding: "8px 10px",
              background: "rgba(11,11,13,0.03)",
              borderRadius: 8,
              lineHeight: 1.5,
            }}
          >
            {leadId ? <div>Lead: {leadId}</div> : null}
            {error?.digest ? <div>Ref: {error.digest}</div> : null}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap" as const,
            gap: 10,
            marginTop: 24,
          }}
        >
          <Link
            href={retryHref}
            prefetch={false}
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 20px",
              borderRadius: 999,
              background: "#0F4F3E",
              color: "#ffffff",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Try again
          </Link>
          <a
            href={mailto}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "10px 20px",
              borderRadius: 999,
              border: "1px solid rgba(24,24,27,0.12)",
              background: "transparent",
              color: "#0B0B0D",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Get help
          </a>
        </div>
      </div>
    </div>
  );
}
