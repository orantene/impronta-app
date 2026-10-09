/**
 * Soft "this site is only in one language" notice (TUL-516 B1).
 *
 * Talent hosts rewrite here when the URL carries a platform locale the talent
 * does not publish (e.g. `/en` on a Spanish-only demo). Explicit, not a silent
 * redirect to the Spanish home. Whitelisted in the proxy short-circuit.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getRequestLocale } from "@/i18n/request-locale";
import { talentLocaleUnavailableCopy } from "@/lib/saas/talent-locale-unavailable-copy";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = talentLocaleUnavailableCopy(locale);
  return {
    title: { absolute: copy.title },
    robots: { index: false, follow: false },
  };
}

export default async function TalentLocaleUnavailablePage() {
  const locale = await getRequestLocale();
  const copy = talentLocaleUnavailableCopy(locale);
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
        <h1
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 26,
            fontWeight: 600,
            color: "#0B0B0D",
            letterSpacing: -0.4,
            marginTop: 0,
            marginBottom: 0,
          }}
        >
          {copy.heading}
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
          {copy.body}
        </p>
        <div style={{ marginTop: 24 }}>
          <Link
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
            {copy.homeCta}
          </Link>
        </div>
      </div>
    </div>
  );
}
