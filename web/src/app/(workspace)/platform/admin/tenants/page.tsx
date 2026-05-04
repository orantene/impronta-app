// Phase 3.11 — Platform HQ · Tenants
// All agencies and hubs with health, plan, roster count, and status.

import { loadPlatformTenants } from "../../platform-data";

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
  red: "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';
const FM = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  free:    { bg: "rgba(245,242,235,0.08)", color: "rgba(245,242,235,0.62)" },
  studio:  { bg: "rgba(155,168,183,0.15)", color: "#9BA8B7" },
  agency:  { bg: "rgba(93,211,160,0.12)",  color: "#5DD3A0" },
  network: { bg: "rgba(140,100,220,0.15)", color: "#A07AE0" },
};

function planChip(plan: string) {
  const c = PLAN_COLORS[plan] ?? PLAN_COLORS.free;
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "2px 8px",
        background: c.bg,
        color: c.color,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        borderRadius: 999,
        fontFamily: F,
      }}
    >
      {plan}
    </span>
  );
}

function statusDot(status: string) {
  const color = status === "active" ? HQ.green : status === "suspended" ? HQ.red : HQ.amber;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ color: HQ.inkMuted, fontSize: 12.5, textTransform: "capitalize" }}>{status}</span>
    </span>
  );
}

export default async function PlatformTenantsPage() {
  const tenants = await loadPlatformTenants();

  const agencies = tenants.filter((t) => t.entityType !== "hub").length;
  const hubs = tenants.filter((t) => t.entityType === "hub").length;

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
            lineHeight: 1.15,
          }}
        >
          Tenants
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          {tenants.length} total · {agencies} {agencies === 1 ? "agency" : "agencies"} · {hubs}{" "}
          {hubs === 1 ? "hub" : "hubs"}
        </p>
      </div>

      {/* Table card */}
      <section
        style={{
          background: HQ.card,
          border: `1px solid ${HQ.borderSoft}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: F,
              fontSize: 13,
              color: HQ.ink,
            }}
          >
            <thead>
              <tr style={{ borderBottom: `1px solid ${HQ.border}` }}>
                {["Tenant", "Entity", "Plan", "Roster", "Seats", "Status", "Joined"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === "Roster" || h === "Seats" ? "right" : "left",
                      padding: "10px 12px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: HQ.inkMuted,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: 32,
                      textAlign: "center",
                      color: HQ.inkMuted,
                      fontSize: 13,
                    }}
                  >
                    No tenants found.
                  </td>
                </tr>
              ) : (
                tenants.map((t) => (
                  <tr
                    key={t.id}
                    style={{ borderBottom: `1px solid ${HQ.borderSoft}` }}
                  >
                    <td style={{ padding: "12px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 500, color: HQ.ink }}>{t.name}</span>
                        <span
                          style={{
                            color: HQ.inkDim,
                            fontFamily: FM,
                            fontSize: 11,
                          }}
                        >
                          {t.slug}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 12px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "2px 8px",
                          background: "transparent",
                          color: HQ.inkMuted,
                          border: `1px solid ${HQ.borderSoft}`,
                          fontSize: 10.5,
                          fontWeight: 600,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          borderRadius: 999,
                          fontFamily: F,
                        }}
                      >
                        {t.entityType === "hub" ? "·•· Hub" : "▣ Agency"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 12px" }}>{planChip(t.plan)}</td>
                    <td
                      style={{ padding: "12px 12px", textAlign: "right", color: HQ.inkMuted }}
                    >
                      {t.talentCount}
                    </td>
                    <td
                      style={{ padding: "12px 12px", textAlign: "right", color: HQ.inkMuted }}
                    >
                      {t.seats ?? "∞"}
                    </td>
                    <td style={{ padding: "12px 12px" }}>{statusDot(t.status)}</td>
                    <td style={{ padding: "12px 12px", color: HQ.inkDim, fontSize: 12 }}>
                      {t.createdAt}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
