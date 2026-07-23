/**
 * PWA offline fallback page.
 *
 * Served by the service worker when a navigation request fails because the
 * device is offline. This page is precached at SW install time so it renders
 * without a network connection.
 *
 * Requirements:
 *  - Must be a static page (no data fetching, no dynamic headers).
 *  - No Supabase calls — this page may render with no network at all.
 *  - Must be whitelisted in proxy.ts (already done via the pathname === "/offline" bypass)
 *    so it loads regardless of which host resolves the request.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You are offline",
  robots: { index: false, follow: false },
};

// Static — no dynamic data, no auth. Safe to cache by the SW.
export const dynamic = "error";

export default function OfflinePage() {
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
            textTransform: "uppercase",
            margin: 0,
          }}
        >
          TULALA
        </p>
        <h1
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 600,
            color: "#0B0B0D",
            letterSpacing: -0.4,
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          No connection
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
          It looks like you are offline. Check your connection and try again.
        </p>

        <div style={{ marginTop: 24 }}>
          {/* Inline script: refresh button. No external deps required for offline render. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
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
              textDecoration: "none",
            }}
          >
            Try again
          </a>
        </div>
      </div>
    </div>
  );
}
