// Phase 3.11 — Platform HQ · Settings
// HQ team, audit trail, region config.

import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadPlatformSuperAdmins } from "../../platform-data";

export const dynamic = "force-dynamic";

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
      <div className="mb-2.5">
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

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function PlatformSettingsPage() {
  const session = await getCachedActorSession();
  const hqTeam = await loadPlatformSuperAdmins();
  const currentUserId = session.user?.id;

  return (
    <>
      {/* Page header */}
      <div className="mb-6">
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
        {/* HQ team — all users with platform staff role */}
        <HqCard
          title={`HQ team (${hqTeam.length})`}
          subtitle="Users with platform super_admin or agency_staff access"
        >
          {hqTeam.length === 0 ? (
            <div style={{ padding: "16px 0", color: HQ.inkMuted, fontSize: 13, fontFamily: F }}>
              No platform staff configured yet.
            </div>
          ) : (
            hqTeam.map((member) => {
              const isSuperAdmin = member.appRole === "super_admin";
              const isMe = member.id === currentUserId;
              const accent = isSuperAdmin ? HQ.green : HQ.amber;
              const accentBg = isSuperAdmin
                ? "rgba(93,211,160,0.12)"
                : "rgba(155,168,183,0.15)";
              return (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 0",
                    borderTop: `1px solid ${HQ.borderSoft}`,
                    fontFamily: F,
                    color: HQ.ink,
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: accentBg,
                      color: accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                      letterSpacing: 0.5,
                    }}
                  >
                    {initials(member.displayName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                      {member.displayName}
                      {isMe && (
                        <span
                          style={{
                            fontSize: 9.5,
                            color: HQ.inkMuted,
                            background: HQ.cardSoft,
                            padding: "1px 6px",
                            borderRadius: 999,
                            letterSpacing: 0.4,
                            textTransform: "uppercase" as const,
                            fontWeight: 600,
                          }}
                        >
                          you
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: HQ.inkMuted,
                        marginTop: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {member.email}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "2px 8px",
                      background: HQ.cardSoft,
                      color: accent,
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      borderRadius: 999,
                    }}
                  >
                    {member.appRole}
                  </span>
                </div>
              );
            })
          )}
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
