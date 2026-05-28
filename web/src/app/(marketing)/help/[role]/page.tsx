import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ role: string }> };

const ROLES = ["operators", "agencies", "talents", "clients"] as const;
type Role = (typeof ROLES)[number];

function isRole(s: string): s is Role {
  return (ROLES as readonly string[]).includes(s);
}

const ROLE_LABELS: Record<Role, { title: string; description: string }> = {
  operators: {
    title: "Help for independent operators",
    description:
      "Quick guides for solo agents claiming a free Tulala URL, building their first roster, and turning the first DM into a real booking pipeline.",
  },
  agencies: {
    title: "Help for representation agencies",
    description:
      "Setting up multi-seat teams, custom domains, design system, CMS, and the full inquiry → offer → booking pipeline.",
  },
  talents: {
    title: "Help for talents on a roster",
    description:
      "Editing your profile, managing availability, syncing your social handles, and tracking the bookings coming through your agency.",
  },
  clients: {
    title: "Help for clients booking talent",
    description:
      "How to send an inquiry, request specific talent, approve an offer, and pay for a confirmed booking.",
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { role } = await params;
  if (!isRole(role)) return { title: "Help — Tulala" };
  return {
    title: `${ROLE_LABELS[role].title} — Tulala`,
    description: ROLE_LABELS[role].description,
  };
}

export default async function HelpRolePage({ params }: Props) {
  const { role } = await params;
  if (!isRole(role)) notFound();

  const info = ROLE_LABELS[role];

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
        href="/help"
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
          marginBottom: 12,
        }}
      >
        {info.title}
      </h1>
      <p style={{ color: "#555", fontSize: "1rem", marginBottom: 40 }}>{info.description}</p>

      <div
        style={{
          padding: "24px 20px",
          background: "#f8f8f5",
          borderRadius: 12,
          fontSize: "0.95rem",
          color: "#444",
          lineHeight: 1.55,
        }}
      >
        <strong>This section is being written.</strong>
        <p style={{ marginTop: 8 }}>
          We&apos;re drafting the {role} guides right now. In the meantime, you can email{" "}
          <a
            href="mailto:help@tulala.digital"
            style={{ color: "#1f4a3a", textDecoration: "underline" }}
          >
            help@tulala.digital
          </a>{" "}
          with any specific question and we&apos;ll respond inside 24 hours.
        </p>
      </div>

      <nav style={{ marginTop: 40, display: "flex", gap: 16, flexWrap: "wrap" }}>
        {ROLES.filter((r) => r !== role).map((other) => (
          <Link
            key={other}
            href={`/help/${other}`}
            style={{
              fontSize: "0.9rem",
              color: "#1f4a3a",
              textDecoration: "underline",
            }}
          >
            {ROLE_LABELS[other].title}
          </Link>
        ))}
      </nav>
    </main>
  );
}
