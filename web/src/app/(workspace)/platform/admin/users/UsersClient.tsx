"use client";

/**
 * Platform Admin — interactive users table.
 *
 * Client-side search / filter / sort over every registered person on Tulala.
 * Identity (Talent / Client / Staff / Super-admin) is independent of workspace
 * power (owner / admin / member of N), so the table surfaces both — a talent
 * who also owns a Studio shows up as Talent + 1 workspace (owner). Rows open
 * the user drawer; the drawer renders the full membership list (agencies and
 * hubs) so platform staff can see a person's footprint at a glance.
 */

import { useMemo, useState } from "react";
import { HQ, HQ_F, HQ_FM, Chip, PlanChip } from "../tenants/hq-kit";
import { UserDrawer } from "./UserDrawer";
import { TypeChip } from "./user-chips";
import type { PlatformUserRow } from "../../platform-data";

type SortKey = "joined" | "name" | "type" | "status" | "workspaces" | "sites" | "lastSeen";
type TypeFilter = "all" | "talent" | "client" | "staff" | "super_admin";
type PowerFilter = "any" | "admin" | "member" | "none";
type EmailFilter = "all" | "unconfirmed";
type StatusFilter = "any" | "claimed" | "unclaimed" | "suspended" | "test";
type OriginFilter = "any" | "agency" | "studio" | "platform" | "self" | "claim_invite";
type PlanFilter = "any" | "free" | "studio" | "agency";

const selectStyle: React.CSSProperties = {
  background: HQ.card,
  border: `1px solid ${HQ.border}`,
  borderRadius: 8,
  color: HQ.ink,
  fontSize: 12,
  fontFamily: HQ_F,
  padding: "6px 8px",
  outline: "none",
};

function classifyType(appRole: string | null): TypeFilter {
  if (appRole === "super_admin") return "super_admin";
  if (appRole === "talent") return "talent";
  if (appRole === "client") return "client";
  // agency_staff, admin, and anything else collapse into the "staff" bucket.
  return "staff";
}

type StatusChipInfo = {
  label: string;
  bg: string;
  color: string;
};

function deriveStatus(r: PlatformUserRow): StatusChipInfo {
  if (r.isTestAccount) {
    return { label: "Test", bg: "rgba(229,181,103,0.12)", color: HQ.amber };
  }
  if (r.kind === "human" && r.accountStatus === "suspended") {
    return { label: "Suspended", bg: "rgba(243,103,114,0.12)", color: HQ.red };
  }
  if (r.kind === "human" && r.talentProfileId) {
    return { label: "Claimed", bg: "rgba(93,211,160,0.12)", color: HQ.green };
  }
  if (r.kind === "unclaimed_talent" && r.originKind === "agency_signup") {
    return {
      label: "Unclaimed · Agency",
      bg: "rgba(245,242,235,0.08)",
      color: "rgba(245,242,235,0.62)",
    };
  }
  if (r.kind === "unclaimed_talent" && r.originKind === "studio_signup") {
    return {
      label: "Unclaimed · Studio",
      bg: "rgba(245,242,235,0.08)",
      color: "rgba(245,242,235,0.62)",
    };
  }
  if (r.kind === "unclaimed_talent") {
    return {
      label: "Unclaimed",
      bg: "rgba(245,242,235,0.08)",
      color: "rgba(245,242,235,0.62)",
    };
  }
  // kind === "human" (default)
  return { label: "Active", bg: "rgba(255,255,255,0.04)", color: HQ.inkMuted };
}

function derivePlan(r: PlatformUserRow): string | null {
  if (r.kind !== "human") return null;
  const adminMemberships = r.memberships.filter(
    (m) => m.kind === "agency" && (m.role === "owner" || m.role === "admin"),
  );
  if (adminMemberships.length === 0) return null;

  const planRank: Record<string, number> = {
    agency: 0,
    network: 1,
    studio: 2,
    free: 3,
  };

  let highestPlan = adminMemberships[0].plan;
  for (const m of adminMemberships) {
    if ((planRank[m.plan] ?? 9) < (planRank[highestPlan] ?? 9)) {
      highestPlan = m.plan;
    }
  }
  return highestPlan;
}

function Th({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  align = "left",
  lo = false,
}: {
  label: string;
  column?: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right" | "center";
  lo?: boolean;
}) {
  return (
    <th
      className={lo ? "hqu-lo" : undefined}
      onClick={column ? () => onSort(column) : undefined}
      style={{
        textAlign: align,
        padding: "9px 12px",
        fontSize: 10,
        fontWeight: 700,
        color: HQ.inkMuted,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        cursor: column ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {label}
      {column && sortKey === column && (
        <span style={{ color: HQ.green }}>{sortDir === "asc" ? " ▲" : " ▼"}</span>
      )}
    </th>
  );
}

export function UsersClient({ rows }: { rows: PlatformUserRow[] }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter | "all">("all");
  const [power, setPower] = useState<PowerFilter>("any");
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("any");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("any");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("any");
  // TODO B.2: HasStripe filter — needs stripe_customer_id on row
  const [sortKey, setSortKey] = useState<SortKey>("joined");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (q) {
        const email = r.kind === "human" ? r.email : "";
        const hay = `${r.displayName} ${email} ${r.memberships
          .map((m) => m.name)
          .join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter !== "all" && classifyType(r.appRole) !== typeFilter) {
        return false;
      }
      if (power === "admin" && r.workspaceAdminCount === 0) return false;
      if (
        power === "member" &&
        (r.tenantCount === 0 || r.workspaceAdminCount > 0)
      ) {
        return false;
      }
      if (power === "none" && r.tenantCount > 0) return false;
      if (emailFilter === "unconfirmed") {
        // Unclaimed talent has no email to confirm — exclude from this filter.
        if (r.kind !== "human" || r.emailConfirmed) return false;
      }
      // Status filter
      if (statusFilter !== "any") {
        if (statusFilter === "unclaimed") {
          if (r.kind !== "unclaimed_talent") return false;
        } else if (statusFilter === "claimed") {
          if (r.kind !== "human" || !r.isTalent || !r.talentProfileId) return false;
        } else if (statusFilter === "suspended") {
          if (r.kind !== "human" || r.accountStatus !== "suspended") return false;
        } else if (statusFilter === "test") {
          if (!r.isTestAccount) return false;
        }
      }
      // Origin filter
      if (originFilter !== "any") {
        const originKindMap: Record<OriginFilter, string> = {
          any: "",
          agency: "agency_signup",
          studio: "studio_signup",
          platform: "platform_admin_signup",
          self: "self_signup",
          claim_invite: "claim_invite",
        };
        if (r.originKind !== originKindMap[originFilter]) return false;
      }
      // Plan tier filter
      if (planFilter !== "any") {
        const adminMs = r.memberships.filter(
          (m) => m.role === "owner" || m.role === "admin",
        );
        if (planFilter === "free") {
          // No admin membership OR all admin memberships are plan "free"
          if (adminMs.some((m) => m.plan !== "free")) return false;
        } else if (planFilter === "studio") {
          if (!adminMs.some((m) => m.plan === "studio")) return false;
        } else if (planFilter === "agency") {
          if (!adminMs.some((m) => m.plan === "agency" || m.plan === "network")) return false;
        }
      }
      return true;
    });

    const typeRank: Record<string, number> = {
      super_admin: 0, staff: 1, talent: 2, client: 3,
    };

    out = [...out].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.displayName.localeCompare(b.displayName);
          break;
        case "type":
          cmp =
            (typeRank[classifyType(a.appRole)] ?? 9) -
            (typeRank[classifyType(b.appRole)] ?? 9);
          break;
        case "status": {
          const statusOrder: Record<string, number> = {
            test: 0,
            suspended: 1,
            unclaimed: 2,
            claimed: 3,
            active: 4,
          };
          const getStatusKey = (r: PlatformUserRow) => {
            if (r.isTestAccount) return "test";
            if (r.kind === "human" && r.accountStatus === "suspended")
              return "suspended";
            if (r.kind === "human" && r.talentProfileId) return "claimed";
            if (r.kind === "unclaimed_talent") return "unclaimed";
            return "active";
          };
          const aKey = getStatusKey(a);
          const bKey = getStatusKey(b);
          cmp =
            (statusOrder[aKey] ?? 9) - (statusOrder[bKey] ?? 9);
          if (cmp === 0) cmp = a.displayName.localeCompare(b.displayName);
          break;
        }
        case "workspaces":
          cmp = a.workspaceAdminCount - b.workspaceAdminCount;
          if (cmp === 0) cmp = a.workspaceCount - b.workspaceCount;
          break;
        case "sites":
          cmp = a.tenantCount - b.tenantCount;
          break;
        case "lastSeen":
          cmp = (a.lastSignInAtIso ?? "").localeCompare(b.lastSignInAtIso ?? "");
          break;
        case "joined":
        default:
          cmp = (a.createdAtIso ?? "").localeCompare(b.createdAtIso ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, search, typeFilter, power, emailFilter, statusFilter, originFilter, planFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "type" ? "asc" : "desc");
    }
  }

  const openRow = openId ? rows.find((r) => r.id === openId) ?? null : null;

  // Helper to check if a chip preset is active
  function isChipActive(
    targetStatus?: StatusFilter,
    targetEmail?: EmailFilter,
    targetPower?: PowerFilter,
    targetType?: TypeFilter | "all",
  ): boolean {
    if (search === "" && originFilter === "any" && planFilter === "any") {
      const typeMatch = targetType !== undefined ? typeFilter === targetType : typeFilter === "all";
      if (!typeMatch) return false;
      if (targetStatus !== undefined) return statusFilter === targetStatus;
      if (targetEmail !== undefined) return emailFilter === targetEmail;
      if (targetPower !== undefined) return power === targetPower;
    }
    return false;
  }

  // Helper to apply a chip preset
  function applyChip(
    targetStatus?: StatusFilter,
    targetEmail?: EmailFilter,
    targetPower?: PowerFilter,
    targetType?: TypeFilter | "all",
  ): void {
    setSearch("");
    setOriginFilter("any");
    setPlanFilter("any");

    // If the chip is already active, toggle it off
    if (isChipActive(targetStatus, targetEmail, targetPower, targetType)) {
      setStatusFilter("any");
      setEmailFilter("all");
      setPower("any");
      setTypeFilter("all");
    } else {
      // Apply the chip
      setTypeFilter(targetType ?? "all");
      if (targetStatus !== undefined) setStatusFilter(targetStatus);
      else setStatusFilter("any");
      if (targetEmail !== undefined) setEmailFilter(targetEmail);
      else setEmailFilter("all");
      if (targetPower !== undefined) setPower(targetPower);
      else setPower("any");
    }
  }

  const chipButtonStyle: React.CSSProperties = {
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    fontFamily: HQ_F,
    background: "transparent",
    border: `1px solid ${HQ.border}`,
    color: HQ.inkMuted,
    cursor: "pointer",
    transition: "all 0.12s ease",
  };

  return (
    <>
      <style>{`
        .hqu-row { transition: background 0.12s ease; }
        .hqu-row:hover { background: rgba(255,255,255,0.03); }
        @media (max-width: 940px) { .hqu-lo { display: none; } }
      `}</style>

      {/* Quick-action filter chips */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: 8,
        }}
      >
        <button
          onClick={() => applyChip("unclaimed")}
          style={{
            ...chipButtonStyle,
            ...(isChipActive("unclaimed")
              ? {
                  background: HQ.cardSoft,
                  border: `1px solid ${HQ.green}`,
                  color: HQ.ink,
                }
              : {}),
          }}
        >
          Unclaimed talents
        </button>
        <button
          onClick={() => applyChip("suspended")}
          style={{
            ...chipButtonStyle,
            ...(isChipActive("suspended")
              ? {
                  background: HQ.cardSoft,
                  border: `1px solid ${HQ.green}`,
                  color: HQ.ink,
                }
              : {}),
          }}
        >
          Suspended
        </button>
        <button
          onClick={() => applyChip(undefined, "unconfirmed")}
          style={{
            ...chipButtonStyle,
            ...(isChipActive(undefined, "unconfirmed")
              ? {
                  background: HQ.cardSoft,
                  border: `1px solid ${HQ.green}`,
                  color: HQ.ink,
                }
              : {}),
          }}
        >
          Unconfirmed email
        </button>
        <button
          onClick={() => applyChip("test")}
          style={{
            ...chipButtonStyle,
            ...(isChipActive("test")
              ? {
                  background: HQ.cardSoft,
                  border: `1px solid ${HQ.green}`,
                  color: HQ.ink,
                }
              : {}),
          }}
        >
          Test accounts
        </button>
        <button
          onClick={() => applyChip(undefined, undefined, "admin")}
          style={{
            ...chipButtonStyle,
            ...(isChipActive(undefined, undefined, "admin")
              ? {
                  background: HQ.cardSoft,
                  border: `1px solid ${HQ.green}`,
                  color: HQ.ink,
                }
              : {}),
          }}
        >
          Workspace operators
        </button>
        <button
          onClick={() => applyChip(undefined, undefined, "admin", "talent")}
          style={{
            ...chipButtonStyle,
            ...(isChipActive(undefined, undefined, "admin", "talent")
              ? {
                  background: HQ.cardSoft,
                  border: `1px solid ${HQ.blue}`,
                  color: HQ.ink,
                }
              : {}),
          }}
        >
          Talent admins
        </button>
        <button
          title="Stripe data coming soon"
          style={{
            ...chipButtonStyle,
          }}
        >
          Stripe connected
        </button>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <input
          type="search"
          placeholder="Search name, email, workspace…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            ...selectStyle,
            flex: "1 1 240px",
            padding: "7px 10px",
          }}
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TypeFilter | "all")}
          style={selectStyle}
        >
          <option value="all">All types</option>
          <option value="talent">Talent</option>
          <option value="client">Client</option>
          <option value="staff">Staff</option>
          <option value="super_admin">Super-admin</option>
        </select>
        <select
          value={power}
          onChange={(e) => setPower(e.target.value as PowerFilter)}
          style={selectStyle}
        >
          <option value="any">Workspace power: any</option>
          <option value="admin">Owner / admin somewhere</option>
          <option value="member">Member only</option>
          <option value="none">No workspace</option>
        </select>
        <select
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value as EmailFilter)}
          style={selectStyle}
        >
          <option value="all">Email: any</option>
          <option value="unconfirmed">Email: unconfirmed</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={selectStyle}
        >
          <option value="any">Any status</option>
          <option value="claimed">Claimed</option>
          <option value="unclaimed">Unclaimed</option>
          <option value="suspended">Suspended</option>
          <option value="test">Test</option>
        </select>
        <select
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value as OriginFilter)}
          style={selectStyle}
        >
          <option value="any">Any origin</option>
          <option value="agency">Agency-added</option>
          <option value="studio">Studio-added</option>
          <option value="platform">Platform-added</option>
          <option value="self">Self-signup</option>
          <option value="claim_invite">Claim invite</option>
        </select>
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as PlanFilter)}
          style={selectStyle}
        >
          <option value="any">Any plan</option>
          <option value="free">Free</option>
          <option value="studio">Studio</option>
          <option value="agency">Agency / Network</option>
        </select>
      </div>

      <div style={{ fontSize: 11.5, color: HQ.inkDim, marginBottom: 8, fontFamily: HQ_F }}>
        {filtered.length} of {rows.length} user{rows.length === 1 ? "" : "s"}
      </div>

      {/* Table */}
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
              fontFamily: HQ_F,
              fontSize: 12.5,
              color: HQ.ink,
              minWidth: 760,
            }}
          >
            <thead>
              <tr style={{ borderBottom: `1px solid ${HQ.border}` }}>
                <Th label="Name" column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Status" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Plan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Type" column="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Workspaces" column="workspaces" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Sites" column="sites" align="right" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Last seen" column="lastSeen" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Joined" column="joined" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: 36,
                      textAlign: "center",
                      color: HQ.inkMuted,
                      fontSize: 13,
                    }}
                  >
                    {rows.length === 0
                      ? "No users found."
                      : "No users match these filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const t = classifyType(r.appRole);
                  return (
                    <tr
                      key={r.id}
                      className="hqu-row"
                      onClick={() => setOpenId(r.id)}
                      style={{
                        borderBottom: `1px solid ${HQ.borderSoft}`,
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: "10px 12px" }}>
                        <div
                          style={{
                            color: HQ.ink,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            flexWrap: "wrap",
                          }}
                        >
                          {r.displayName}
                          {r.kind === "unclaimed_talent" && (
                            <span
                              style={{
                                padding: "1px 6px",
                                background: "rgba(148,163,184,0.12)",
                                color: HQ.inkDim,
                                fontSize: 9.5,
                                fontWeight: 600,
                                letterSpacing: 0.3,
                                textTransform: "uppercase",
                                borderRadius: 999,
                              }}
                              title="Talent profile not yet claimed by a logged-in user"
                            >
                              unclaimed
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {r.kind === "human" ? (
                          <>
                            <span
                              style={{
                                color: r.emailConfirmed ? HQ.inkMuted : HQ.amber,
                                fontFamily: HQ_FM,
                                fontSize: 11.5,
                              }}
                            >
                              {r.email}
                            </span>
                            {!r.emailConfirmed && (
                              <span
                                style={{
                                  display: "inline-flex",
                                  marginLeft: 6,
                                  padding: "1px 6px",
                                  background: "rgba(229,181,103,0.12)",
                                  color: HQ.amber,
                                  fontSize: 9.5,
                                  fontWeight: 600,
                                  letterSpacing: 0.3,
                                  textTransform: "uppercase",
                                  borderRadius: 999,
                                }}
                              >
                                unconfirmed
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: HQ.inkDim, fontSize: 11.5 }}>
                            no login
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {(() => {
                          const status = deriveStatus(r);
                          return (
                            <Chip bg={status.bg} color={status.color}>
                              {status.label}
                            </Chip>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {(() => {
                          const plan = derivePlan(r);
                          return plan ? (
                            <PlanChip plan={plan} />
                          ) : (
                            <span style={{ color: HQ.inkDim }}>—</span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <TypeChip type={t} />
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          color: HQ.inkMuted,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {r.workspaceCount === 0 ? (
                          <span style={{ color: HQ.inkDim }}>—</span>
                        ) : (
                          <>
                            {r.workspaceCount}
                            {r.workspaceAdminCount > 0 && (
                              <span
                                style={{
                                  color: HQ.green,
                                  marginLeft: 6,
                                  fontSize: 10.5,
                                  fontWeight: 700,
                                  letterSpacing: 0.4,
                                  textTransform: "uppercase",
                                }}
                                title={`${r.workspaceAdminCount} as owner/admin`}
                              >
                                {r.workspaceAdminCount} admin
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td
                        className="hqu-lo"
                        style={{
                          padding: "10px 12px",
                          textAlign: "right",
                          color: HQ.inkMuted,
                          fontVariantNumeric: "tabular-nums",
                        }}
                        title={
                          r.tenantCount === 0
                            ? "Not a member of any workspace or hub"
                            : `${r.workspaceCount} workspace${r.workspaceCount === 1 ? "" : "s"} · ${r.hubCount} hub${r.hubCount === 1 ? "" : "s"}`
                        }
                      >
                        {r.tenantCount === 0 ? (
                          <span style={{ color: HQ.inkDim }}>—</span>
                        ) : (
                          r.tenantCount
                        )}
                      </td>
                      <td
                        className="hqu-lo"
                        style={{ padding: "10px 12px", color: HQ.inkDim, fontSize: 11.5 }}
                      >
                        {r.kind === "human" ? r.lastSignInAt ?? "—" : "—"}
                      </td>
                      <td
                        className="hqu-lo"
                        style={{ padding: "10px 12px", color: HQ.inkDim, fontSize: 11.5 }}
                      >
                        {r.createdAt}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <UserDrawer user={openRow} onClose={() => setOpenId(null)} />
    </>
  );
}
