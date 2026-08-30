// Entry point to the Tulala AI brief, from workspace Account & Billing.
//
// Links out to /account/brief rather than rendering the brief here: a brief
// belongs to the PERSON, not the workspace, and a hybrid who owns a workspace
// and a talent profile has one brief describing both sides. Rendering it inside
// workspace chrome would imply one brief per tenant.
//
// Own file because page.tsx sits at the 800-line ceiling.

import Link from "next/link";

const C = {
  ink: "var(--color-admin-ink)",
  inkMuted: "var(--color-admin-ink-muted)",
  border: "var(--color-admin-border)",
  cardBg: "var(--color-admin-card)",
  surface: "var(--color-admin-surface)",
};

const FONT = 'var(--font-admin-body, "Inter", system-ui, sans-serif)';

export function BriefCard({ blurb, linkLabel }: { blurb: string; linkLabel: string }) {
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 12.5,
          lineHeight: 1.55,
          color: C.inkMuted,
          fontFamily: FONT,
        }}
      >
        {blurb}
      </p>
      <Link
        href="/account/brief"
        style={{
          display: "inline-flex",
          alignItems: "center",
          marginTop: 12,
          height: 34,
          padding: "0 14px",
          borderRadius: 8,
          background: C.surface,
          border: `1px solid ${C.border}`,
          color: C.ink,
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        {linkLabel}
      </Link>
    </div>
  );
}
