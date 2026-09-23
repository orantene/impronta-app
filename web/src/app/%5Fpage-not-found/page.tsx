/**
 * Branded "page not found" 404.
 *
 * Rendered by the middleware (proxy.ts) when a request hits a KNOWN host
 * (marketing / app / agency / hub) on a path that isn't served there — a
 * mistyped or stale URL. The middleware rewrites here with a 404 status
 * instead of returning bare "Not found" text, so a wrong URL lands on branded
 * chrome with a clear way home, never a dead end.
 *
 * Lives outside every tenant-aware route group so it renders safely without a
 * host context (mirrors `/_host-unregistered`). Whitelisted in the proxy
 * short-circuit so the rewrite doesn't recurse. Links are absolute (the
 * homepage lives on the marketing host, sign-in on the app host) so they work
 * regardless of which host produced the 404.
 */
import type { Metadata } from "next";
import { getAppUrl, getSiteUrl } from "@/lib/auth-flow";

export const metadata: Metadata = {
  title: "Page not found — Tulala",
  robots: { index: false, follow: false },
};

export default function PageNotFound() {
  const site = getSiteUrl();
  const app = getAppUrl();
  return (
    <div
      style={{
        minHeight: "100dvh",
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
          Tulala
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
          }}
        >
          Page not found
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
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
          Head back to the homepage, or sign in to your workspace.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 24 }}>
          <a
            href={site}
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
            Go to homepage
          </a>
          <a
            href={`${app}/login`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              background: "#ffffff",
              border: "1px solid rgba(24,24,27,0.14)",
              color: "#0B0B0D",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
