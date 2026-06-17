"use client";

// Admin workspace route-segment error boundary.
//
// Covers all /{tenantSlug}/admin/* routes (roster, messages, work, bookings,
// settings, etc.). Errors thrown during server render of the admin layout's
// parallel data prefetch (Promise.all), or unhandled throws in the client
// AdminShellClient tree, bubble here instead of falling through to the global
// app/error.tsx. The right recovery action is a retry on the same admin
// surface — not a redirect to "/".

import { useEffect } from "react";
import { logServerError } from "@/lib/server/safe-error";

export default function AdminWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logServerError("admin/error.tsx", error);
  }, [error]);

  return (
    <div
      role="alert"
      style={{
        minHeight: "60vh",
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
          maxWidth: 480,
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
          Workspace
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
          Something went wrong
        </h1>
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 13.5,
            color: "rgba(11,11,13,0.60)",
            lineHeight: 1.55,
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          This section failed to load. Retry to reload it — your data is safe.
        </p>
        {error?.digest ? (
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 11,
              color: "rgba(11,11,13,0.35)",
              marginTop: 8,
              marginBottom: 0,
            }}
          >
            Ref: {error.digest}
          </p>
        ) : null}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap" as const,
            gap: 10,
            marginTop: 24,
          }}
        >
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              background: "#0F4F3E",
              color: "#ffffff",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
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
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
