"use client";

// /talent/* 404 (TUL-670). Renders inside the talent layout, so it inherits the
// dashboard locale provider and shell; copy follows the dashboard language.

import Link from "next/link";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { TALENT_NOT_FOUND_MIN_HEIGHT, talentNotFoundCopy } from "./_talent-not-found-copy";

export default function TalentNotFound() {
  const copy = talentNotFoundCopy(useDashboardLocale());
  const font = '"Inter", system-ui, sans-serif';
  return (
    <div
      style={{
        minHeight: TALENT_NOT_FOUND_MIN_HEIGHT,
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
          padding: "32px",
        }}
      >
        <p style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: "rgba(11,11,13,0.38)", letterSpacing: 0.8, textTransform: "uppercase", margin: 0 }}>
          {copy.eyebrow}
        </p>
        <h1 style={{ fontFamily: font, fontSize: 26, fontWeight: 600, color: "#0B0B0D", letterSpacing: -0.4, marginTop: 12, marginBottom: 0 }}>
          {copy.title}
        </h1>
        <p style={{ fontFamily: font, fontSize: 13.5, color: "rgba(11,11,13,0.60)", lineHeight: 1.55, marginTop: 10, marginBottom: 0 }}>
          {copy.body}
        </p>
        <div style={{ marginTop: 24 }}>
          <Link
            href="/talent/today"
            style={{ display: "inline-flex", alignItems: "center", padding: "9px 18px", borderRadius: 999, background: "#0F4F3E", color: "#ffffff", fontFamily: font, fontSize: 13.5, fontWeight: 600, textDecoration: "none" }}
          >
            {copy.home}
          </Link>
        </div>
      </div>
    </div>
  );
}
