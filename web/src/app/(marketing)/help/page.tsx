import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help & docs · Tulala",
  description:
    "Guides for operators, agencies, talents, and clients using Tulala. Find your role and start there.",
};

/**
 * Help docs index — `tulala.digital/help`. Phase 1 is scaffolding: real
 * articles get written by the user when they have time. The four role
 * cards correspond to the four primary personas; each links to a
 * subpage that today is a placeholder + a contact CTA.
 */

type RoleCard = {
  slug: string;
  title: string;
  description: string;
};

const ROLES: RoleCard[] = [
  {
    slug: "operators",
    title: "Independent operators",
    description:
      "Solo agents and small studios. Claiming your free Tulala URL, building your roster, sending the first inquiry.",
  },
  {
    slug: "agencies",
    title: "Representation agencies",
    description:
      "Multi-seat agencies running multiple coordinators, custom domains, branded sites, and the full pipeline.",
  },
  {
    slug: "talents",
    title: "Talents on a roster",
    description:
      "Models, hosts, performers, and creators. Editing your profile, managing availability, and tracking bookings.",
  },
  {
    slug: "clients",
    title: "Clients booking talent",
    description:
      "Brands, productions, and event planners. Sending inquiries, requesting talent, approving offers.",
  },
];

export default function HelpIndexPage() {
  return (
    <main
      style={{
        padding: "64px 24px",
        maxWidth: 980,
        margin: "0 auto",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 12 }}>
        Help & docs
      </h1>
      <p style={{ color: "#555", fontSize: "1rem", marginBottom: 48, maxWidth: 640 }}>
        Pick your role to find the right guides. If you can&apos;t find what you need, our team is one email away.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
        }}
      >
        {ROLES.map((r) => (
          <Link
            key={r.slug}
            href={`/help/${r.slug}`}
            style={{
              display: "block",
              padding: "24px 20px",
              border: "1px solid #e5e5e5",
              borderRadius: 14,
              textDecoration: "none",
              color: "inherit",
              transition: "border-color 200ms",
            }}
          >
            <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 6 }}>{r.title}</h2>
            <p style={{ fontSize: "0.9rem", color: "#666", lineHeight: 1.5 }}>{r.description}</p>
          </Link>
        ))}
      </div>

      <div
        style={{
          marginTop: 48,
          padding: "24px 20px",
          background: "#f8f8f5",
          borderRadius: 12,
          fontSize: "0.95rem",
          color: "#444",
        }}
      >
        <strong>Can&apos;t find what you need?</strong> Email{" "}
        <a href="mailto:help@tulala.digital" style={{ color: "#1f4a3a", textDecoration: "underline" }}>
          help@tulala.digital
        </a>
        {". We read every message."}
      </div>
    </main>
  );
}
