import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { getSiteUrl } from "@/lib/auth-flow";
import { loadPolicyPageContext } from "@/lib/policies/load-policy-context";
import {
  POLICY_CHROME,
  buildBookingPolicy,
  buildPrivacyNotice,
  toPolicyLocale,
  tulalaPolicyLinks,
} from "@/lib/policies/policy-text";

/**
 * `/policies/booking` and `/policies/privacy` on talent and agency hosts.
 *
 * Generated from canonical settings (see lib/policies/policy-text.ts). Who the
 * page speaks for comes from the proxy-set host headers only. Not indexed.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type Params = { params: Promise<{ kind: string }> };

export default async function PolicyPage({ params }: Params) {
  const { kind } = await params;
  if (kind !== "booking" && kind !== "privacy") notFound();

  const ctx = await loadPolicyPageContext();
  if (!ctx) notFound();

  const locale = toPolicyLocale(await getRequestLocale());
  const chrome = POLICY_CHROME[locale];
  const links = tulalaPolicyLinks(getSiteUrl());
  const doc =
    kind === "booking"
      ? buildBookingPolicy({ locale, name: ctx.name, ...ctx.terms })
      : buildPrivacyNotice({ locale, name: ctx.name });

  const otherKind = kind === "booking" ? "privacy" : "booking";
  const otherLabel = kind === "booking" ? chrome.privacyNotice : chrome.bookingPolicy;

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 20px 64px",
        color: "var(--site-fg, #1c1917)",
        fontFamily: "var(--site-font-body, inherit)",
        lineHeight: 1.6,
      }}
    >
      <p
        style={{
          fontSize: 13,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          opacity: 0.6,
          margin: 0,
        }}
      >
        {ctx.name}
      </p>
      <h1
        style={{
          fontFamily: "var(--site-font-heading, inherit)",
          fontSize: 32,
          margin: "8px 0 12px",
        }}
      >
        {doc.title}
      </h1>
      <p style={{ fontSize: 17, opacity: 0.85, margin: "0 0 32px" }}>{doc.intro}</p>

      {doc.sections.map((section) => (
        <section key={section.id} style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>{section.heading}</h2>
          {section.paragraphs.map((p, i) => (
            <p key={i} style={{ margin: "0 0 10px" }}>
              {p}
            </p>
          ))}
          {section.bullets ? (
            <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>
              {section.bullets.map((b, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {b}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <footer
        style={{
          marginTop: 40,
          paddingTop: 20,
          borderTop: "1px solid rgba(0,0,0,0.12)",
          fontSize: 14,
          opacity: 0.85,
        }}
      >
        {kind === "booking" ? <p style={{ margin: "0 0 8px" }}>{chrome.paymentsLine}</p> : null}
        <nav style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
          <a href={`/policies/${otherKind}`}>{otherLabel}</a>
          {kind === "booking" ? (
            <a href={links.termsUrl} target="_blank" rel="noopener noreferrer">
              {chrome.tulalaTerms}
            </a>
          ) : (
            <>
              <a href={links.privacyUrl} target="_blank" rel="noopener noreferrer">
                {chrome.tulalaPrivacy}
              </a>
              <a href={links.cookiesUrl} target="_blank" rel="noopener noreferrer">
                {chrome.tulalaCookies}
              </a>
            </>
          )}
        </nav>
      </footer>
    </main>
  );
}
