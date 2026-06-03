"use client";

// Root global-error boundary.
//
// `error.tsx` only catches errors thrown *below* the root layout; an error in
// the root layout itself (or a React render/hooks error that escapes the route
// boundary) bubbles to here. Next + Sentry recommend this file so those render
// errors are reported — without it the build warns and root-level crashes go
// unobserved. It must render its own <html>/<body> because it replaces the
// root layout entirely.
//
// Reporting goes through Sentry (DSN gated — a no-op when unset) so a captured
// #310 / hydration mismatch arrives with a de-minified component stack via the
// source maps the Sentry build step already uploads.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
          background: "#FAFAF7",
          fontFamily: '"Inter", system-ui, sans-serif',
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
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(11,11,13,0.38)",
              letterSpacing: 0.8,
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            TULALA
          </p>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#0B0B0D",
              letterSpacing: -0.4,
              marginTop: 12,
              marginBottom: 0,
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: 13.5,
              color: "rgba(11,11,13,0.60)",
              lineHeight: 1.55,
              marginTop: 10,
              marginBottom: 0,
            }}
          >
            Please try again. If this keeps happening, the agency may need to
            check configuration.
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

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "9px 18px",
                borderRadius: 999,
                border: "1px solid rgba(24,24,27,0.12)",
                background: "transparent",
                color: "#0B0B0D",
                fontFamily: "inherit",
                fontSize: 13.5,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                // Full reload — refetches the document + the current
                // deployment's chunks, which clears a stale-client / version-
                // skew hydration mismatch that `reset()` (same tree) can't.
                if (typeof window !== "undefined") window.location.reload();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "9px 18px",
                borderRadius: 999,
                border: "none",
                background: "#0F4F3E",
                color: "#ffffff",
                fontFamily: "inherit",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
