// Phase 3.11 — Platform HQ · Settings
// HQ team, audit trail, region config.

import { getCachedActorSession } from "@/lib/server/request-cache";

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#9BA8B7",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function HqCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: F,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10.5,
            color: HQ.inkMuted,
            fontWeight: 600,
            letterSpacing: 1.2,
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
        {subtitle && (
          <p style={{ margin: "3px 0 0", fontSize: 12.5, color: HQ.inkMuted }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function SettingRow({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "green" | "muted";
}) {
  const valueColor =
    tone === "green" ? HQ.green : tone === "muted" ? HQ.inkDim : HQ.inkMuted;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontFamily: F,
      }}
    >
      <span style={{ flex: 1, fontSize: 13, color: HQ.ink }}>{label}</span>
      <span style={{ fontSize: 13, color: valueColor }}>{value}</span>
    </div>
  );
}

export default async function PlatformSettingsPage() {
  const session = await getCachedActorSession();

  const userEmail =
    session.user?.email ?? "—";
  const userName =
    (session.user?.user_metadata?.full_name as string | undefined) ??
    (session.user?.user_metadata?.name as string | undefined) ??
    userEmail.split("@")[0];

  function initials(name: string) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  }

  return (
    <>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: FD,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: HQ.ink,
            margin: 0,
          }}
        >
          HQ settings
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          The internal team, audit trail, region config, and other platform-wide settings.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
        }}
      >
        {/* HQ team — shows the current logged-in super admin */}
        <HqCard title="HQ team" subtitle="Users with platform super_admin access">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 0",
              borderTop: `1px solid ${HQ.borderSoft}`,
              fontFamily: F,
              color: HQ.ink,
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "rgba(93,211,160,0.12)",
                color: HQ.green,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                flexShrink: 0,
                letterSpacing: 0.5,
              }}
            >
              {initials(userName)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{userName}</div>
              <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 1 }}>
                {userEmail}
              </div>
            </div>
            <span
              style={{
                padding: "2px 8px",
                background: HQ.cardSoft,
                color: HQ.green,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                borderRadius: 999,
              }}
            >
              super_admin
            </span>
          </div>
        </HqCard>

        {/* Platform config */}
        <HqCard title="Platform config" subtitle="Read-only overview of system settings">
          <SettingRow label="Platform" value="Tulala" />
          <SettingRow label="Environment" value={process.env.NODE_ENV ?? "unknown"} />
          <SettingRow label="Auth provider" value="Supabase" />
          <SettingRow label="Storage" value="Supabase Storage" />
          <SettingRow label="Billing" value="Stripe (Phase 8)" tone="muted" />
        </HqCard>
      </div>

      <div style={{ height: 12 }} />

      {/* Audit trail — placeholder */}
      <HqCard
        title="Audit trail"
        subtitle="All platform-level actions by HQ users. Full audit log ships in Phase 4."
      >
        <div
          style={{
            padding: "24px 0",
            textAlign: "center",
            color: HQ.inkMuted,
            fontSize: 13,
            fontFamily: F,
          }}
        >
          Audit log capture starts when platform-level write operations (flag toggles, plan
          overrides, impersonation sessions) are implemented in Phase 4.
        </div>
      </HqCard>
    </>
  );
}
