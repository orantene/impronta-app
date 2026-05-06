"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NotFound() {
  const pathname = usePathname();

  return (
    <div style={{ minHeight: "70vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px", background: "#FAFAF7" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "#ffffff", border: "1px solid rgba(24,24,27,0.10)", borderRadius: 16, padding: "32px 32px" }}>
        <p style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 11, fontWeight: 600, color: "rgba(11,11,13,0.38)", letterSpacing: 0.8, textTransform: "uppercase" as const, margin: 0 }}>
          Tulala
        </p>
        <h1 style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 28, fontWeight: 600, color: "#0B0B0D", letterSpacing: -0.4, marginTop: 12, marginBottom: 0 }}>
          Page not found
        </h1>
        <p style={{ fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13.5, color: "rgba(11,11,13,0.60)", lineHeight: 1.55, marginTop: 10, marginBottom: 0 }}>
          {"We couldn't find the page you're looking for."}
          {pathname ? (
            <span style={{ display: "block", marginTop: 6, fontFamily: "monospace", fontSize: 11, color: "rgba(11,11,13,0.35)" }}>
              {pathname}
            </span>
          ) : null}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 10, marginTop: 24 }}>
          <Link
            href="/"
            style={{ display: "inline-flex", alignItems: "center", padding: "9px 18px", borderRadius: 999, border: "1px solid rgba(24,24,27,0.12)", background: "transparent", color: "#0B0B0D", fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13.5, fontWeight: 500, textDecoration: "none" }}
          >
            Go home
          </Link>
          <Link
            href="/login"
            style={{ display: "inline-flex", alignItems: "center", padding: "9px 18px", borderRadius: 999, background: "#0F4F3E", color: "#ffffff", fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
