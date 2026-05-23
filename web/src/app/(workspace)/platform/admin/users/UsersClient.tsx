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
import { HQ, HQ_F, HQ_FM } from "../tenants/hq-kit";
import { UserDrawer } from "./UserDrawer";
import { TypeChip } from "./user-chips";
import type { PlatformUserRow } from "../../platform-data";

type SortKey = "joined" | "name" | "type" | "workspaces" | "sites";
type TypeFilter = "all" | "talent" | "client" | "staff" | "super_admin";
type PowerFilter = "any" | "admin" | "member" | "none";
type EmailFilter = "all" | "unconfirmed";

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
  const [sortKey, setSortKey] = useState<SortKey>("joined");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (q) {
        const hay = `${r.displayName} ${r.email} ${r.memberships
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
      if (emailFilter === "unconfirmed" && r.emailConfirmed) return false;
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
        case "workspaces":
          cmp = a.workspaceAdminCount - b.workspaceAdminCount;
          if (cmp === 0) cmp = a.workspaceCount - b.workspaceCount;
          break;
        case "sites":
          cmp = a.tenantCount - b.tenantCount;
          break;
        case "joined":
        default:
          cmp = (a.createdAtIso ?? "").localeCompare(b.createdAtIso ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, search, typeFilter, power, emailFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "type" ? "asc" : "desc");
    }
  }

  const openRow = openId ? rows.find((r) => r.id === openId) ?? null : null;

  return (
    <>
      <style>{`
        .hqu-row { transition: background 0.12s ease; }
        .hqu-row:hover { background: rgba(255,255,255,0.03); }
        @media (max-width: 940px) { .hqu-lo { display: none; } }
      `}</style>

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
                <Th label="Type" column="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Workspaces" column="workspaces" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Sites" column="sites" align="right" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Joined" column="joined" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
                        <div style={{ color: HQ.ink, fontWeight: 600 }}>
                          {r.displayName}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
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
