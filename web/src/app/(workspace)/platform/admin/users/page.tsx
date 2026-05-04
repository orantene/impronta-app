// Phase 3.11 — Platform HQ · Users
// All registered users across every tenant.

import { loadPlatformUsers } from "../../platform-data";

const HQ = {
  card: "#16161A",
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
const FM = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';

function roleChip(role: string | null) {
  const colors: Record<string, { bg: string; color: string }> = {
    super_admin: { bg: "rgba(93,211,160,0.12)",  color: "#5DD3A0" },
    admin:       { bg: "rgba(140,100,220,0.12)", color: "#A07AE0" },
    talent:      { bg: "rgba(155,168,183,0.12)", color: "#9BA8B7" },
    client:      { bg: "rgba(245,242,235,0.08)", color: "rgba(245,242,235,0.62)" },
  };
  if (!role) return null;
  const c = colors[role] ?? colors.client;
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "2px 7px",
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
      {role}
    </span>
  );
}

export default async function PlatformUsersPage() {
  const users = await loadPlatformUsers();

  const talentCount = users.filter((u) => u.isTalent).length;
  const adminCount = users.filter((u) => u.appRole === "admin" || u.appRole === "super_admin").length;

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
          Users
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: HQ.inkMuted,
            margin: "5px 0 0",
          }}
        >
          {users.length} total · {talentCount} talent · {adminCount} admin/staff
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
                {["Name", "Email", "Role", "Primary tenant", "Tenants", "Joined"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === "Tenants" ? "right" : "left",
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
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: 32,
                      textAlign: "center",
                      color: HQ.inkMuted,
                      fontSize: 13,
                    }}
                  >
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    style={{ borderBottom: `1px solid ${HQ.borderSoft}` }}
                  >
                    <td style={{ padding: "12px 12px", fontWeight: 500 }}>
                      {u.displayName}
                    </td>
                    <td
                      style={{
                        padding: "12px 12px",
                        color: HQ.inkMuted,
                        fontFamily: FM,
                        fontSize: 11.5,
                      }}
                    >
                      {u.email}
                    </td>
                    <td style={{ padding: "12px 12px" }}>
                      {roleChip(u.appRole)}
                    </td>
                    <td style={{ padding: "12px 12px", color: HQ.inkMuted }}>
                      {u.primaryTenant ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "12px 12px",
                        textAlign: "right",
                        color: HQ.inkMuted,
                      }}
                    >
                      {u.tenantCount}
                    </td>
                    <td
                      style={{ padding: "12px 12px", color: HQ.inkDim, fontSize: 12 }}
                    >
                      {u.createdAt}
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
