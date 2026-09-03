import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withLocaleHref } from "@/i18n/pathnames";
import { getRequestLocale } from "@/i18n/request-locale";
import { ROLE_LABELS, HELP_GUIDE_ROLES, isHelpGuideRole } from "@/lib/marketing/help-guides";

type Props = { params: Promise<{ role: string }> };

const ROLES = HELP_GUIDE_ROLES;
type Role = (typeof ROLES)[number];

function isRole(s: string): s is Role {
  return isHelpGuideRole(s);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { role } = await params;
  if (!isRole(role)) return { title: "Help · Tulala" };
  // Title and description follow the body: a Spanish search result that
  // promises Spanish and opens in English is a worse click than an honest one.
  const locale = await getRequestLocale();
  const entry = ROLE_LABELS[role];
  const c = locale === "es" && entry.es ? entry.es : entry;
  return {
    title: `${c.title} · Tulala`,
    description: c.intro.slice(0, 160),
  };
}

export default async function HelpRolePage({ params }: Props) {
  const { role } = await params;
  // /help ships under both locales (see the sitemap), so the back-link has to
  // keep a Spanish reader in the Spanish URL space.
  const locale = await getRequestLocale();
  if (!isRole(role)) notFound();

  // Most roles are English-only; the business guides are authored in both. Show
  // a Spanish reader the Spanish body where it exists rather than a Spanish
  // chrome wrapped around an English guide — the guest AI already grounds on
  // exactly this distinction, and the page disagreeing with it would be worse
  // than either one alone.
  const role_ = ROLE_LABELS[role];
  const c = locale === "es" && role_.es ? { ...role_, ...role_.es } : role_;

  return (
    <main
      style={{
        padding: "64px 24px",
        maxWidth: 760,
        margin: "0 auto",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <Link
        href={withLocaleHref("/help", locale)}
        style={{ color: "#1f4a3a", fontSize: "0.85rem", textDecoration: "underline" }}
      >
        ← All help topics
      </Link>
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          marginTop: 16,
          marginBottom: 16,
        }}
      >
        {c.title}
      </h1>
      <p
        style={{
          color: "#555",
          fontSize: "1.05rem",
          lineHeight: 1.55,
          marginBottom: 48,
        }}
      >
        {c.intro}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {c.guides.map((g, i) => (
          <article
            key={i}
            style={{
              padding: "20px 22px",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
              background: "#fff",
            }}
          >
            <h2
              style={{
                fontSize: "1.1rem",
                fontWeight: 600,
                marginBottom: 8,
                letterSpacing: "-0.01em",
              }}
            >
              {g.heading}
            </h2>
            <p style={{ color: "#444", fontSize: "0.95rem", lineHeight: 1.6 }}>{g.body}</p>
          </article>
        ))}
      </div>

      <div
        style={{
          marginTop: 48,
          padding: "20px 22px",
          background: "#f0f5f1",
          borderRadius: 12,
          fontSize: "0.95rem",
          color: "#1f4a3a",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <strong>Still stuck?</strong>
        <p style={{ margin: 0, lineHeight: 1.55 }}>
          Write to us on the{" "}
          <Link
            href={withLocaleHref("/contact", locale)}
            style={{ color: "#1f4a3a", textDecoration: "underline" }}
          >
            contact form
          </Link>
          . We read every message and respond inside 24 hours.
        </p>
        <Link
          href={c.ctaPrimary.href}
          style={{
            display: "inline-block",
            marginTop: 4,
            padding: "10px 18px",
            background: "#1f4a3a",
            color: "#fff",
            borderRadius: 999,
            textDecoration: "none",
            fontSize: "0.9rem",
            fontWeight: 600,
            alignSelf: "flex-start",
          }}
        >
          {c.ctaPrimary.label} →
        </Link>
      </div>

      <nav
        style={{
          marginTop: 40,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          paddingTop: 24,
          borderTop: "1px solid #e5e5e5",
        }}
      >
        {ROLES.filter((r) => r !== role).map((other) => (
          <Link
            key={other}
            href={withLocaleHref(`/help/${other}`, locale)}
            style={{
              fontSize: "0.9rem",
              color: "#1f4a3a",
              textDecoration: "underline",
            }}
          >
            {(locale === "es" && ROLE_LABELS[other].es ? ROLE_LABELS[other].es : ROLE_LABELS[other]).title}
          </Link>
        ))}
      </nav>
    </main>
  );
}
