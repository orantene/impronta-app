"use client";

/**
 * Platform Admin — interactive tenants table.
 *
 * Client-side search / filter / sort over the workspace list (the platform
 * is small enough that client-side is correct; virtualization is a scale
 * follow-up). Rows open the management drawer; the name links to the full
 * detail page.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { HQ, HQ_F, HQ_FM, PlanChip, StatusDot, EntityChip } from "./hq-kit";
import { TenantDrawer } from "./TenantDrawer";
import { PLAN_TIER_RANK } from "@/lib/platform/plan-override";
import type { PlatformTenantListRow } from "../../tenant-management-data";

type SortKey = "created" | "name" | "plan" | "talents" | "staff" | "owner";

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

function expiryLabel(iso: string | null): string {
  if (!iso) return "no expiry";
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (Number.isNaN(days)) return "expires";
  if (days < 0) return "expired";
  if (days === 0) return "expires today";
  return `${days}d left`;
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
      className={lo ? "hqt-lo" : undefined}
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

export function TenantsClient({ rows }: { rows: PlatformTenantListRow[] }) {
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [entity, setEntity] = useState("all");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [override, setOverride] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openId, setOpenId] = useState<string | null>(null);

  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (q) {
        const hay = `${r.name} ${r.slug} ${r.ownerName ?? ""} ${r.ownerEmail ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (plan !== "all" && r.plan !== plan) return false;
      if (entity !== "all" && r.entityType !== entity) return false;
      if (status !== "all" && r.status !== status) return false;
      if (owner === "has" && !r.hasOwner) return false;
      if (owner === "missing" && r.hasOwner) return false;
      if (override === "active" && !r.hasActiveOverride) return false;
      if (override === "none" && r.hasActiveOverride) return false;
      return true;
    });

    out = [...out].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "plan":
          cmp = PLAN_TIER_RANK[a.plan] - PLAN_TIER_RANK[b.plan];
          break;
        case "talents":
          cmp = a.activeTalentCount - b.activeTalentCount;
          break;
        case "staff":
          cmp = a.staffCount - b.staffCount;
          break;
        case "owner":
          cmp = (a.ownerName ?? "~").localeCompare(b.ownerName ?? "~");
          break;
        case "created":
        default:
          cmp = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, search, plan, entity, status, owner, override, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "owner" ? "asc" : "desc");
    }
  }

  return (
    <>
      <style>{`
        .hqt-row { transition: background 0.12s ease; }
        .hqt-row:hover { background: rgba(255,255,255,0.03); }
        @media (max-width: 940px) { .hqt-lo { display: none; } }
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
          placeholder="Search workspace, slug, owner…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            ...selectStyle,
            flex: "1 1 240px",
            padding: "7px 10px",
          }}
        />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} style={selectStyle}>
          <option value="all">All plans</option>
          <option value="free">Free</option>
          <option value="studio">Studio</option>
          <option value="agency">Agency</option>
          <option value="network">Network</option>
        </select>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} style={selectStyle}>
          <option value="all">All types</option>
          <option value="agency">Agency</option>
          <option value="hub">Hub</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          <option value="all">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} style={selectStyle}>
          <option value="all">Owner: any</option>
          <option value="has">Owner: assigned</option>
          <option value="missing">Owner: missing</option>
        </select>
        <select value={override} onChange={(e) => setOverride(e.target.value)} style={selectStyle}>
          <option value="all">Override: any</option>
          <option value="active">Override: active</option>
          <option value="none">Override: none</option>
        </select>
      </div>

      <div style={{ fontSize: 11.5, color: HQ.inkDim, marginBottom: 8, fontFamily: HQ_F }}>
        {filtered.length} of {rows.length} workspace{rows.length === 1 ? "" : "s"}
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
              minWidth: 720,
            }}
          >
            <thead>
              <tr style={{ borderBottom: `1px solid ${HQ.border}` }}>
                <Th label="Workspace" column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Plan" column="plan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Language" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Owner" column="owner" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Talents" column="talents" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Types" align="right" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Staff" column="staff" align="right" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="Created" column="created" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label="" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    style={{
                      padding: 36,
                      textAlign: "center",
                      color: HQ.inkMuted,
                      fontSize: 13,
                    }}
                  >
                    {rows.length === 0
                      ? "No workspaces found."
                      : "No workspaces match these filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="hqt-row"
                    onClick={() => setOpenId(r.id)}
                    style={{
                      borderBottom: `1px solid ${HQ.borderSoft}`,
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "10px 12px" }}>
                      <Link
                        href={`/platform/admin/tenants/${r.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          color: HQ.ink,
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        {r.name}
                      </Link>
                      <div
                        style={{ color: HQ.inkDim, fontFamily: HQ_FM, fontSize: 10.5 }}
                      >
                        {r.slug}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <EntityChip entityType={r.entityType} />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <PlanChip plan={r.plan} />
                        {r.hasActiveOverride && (
                          <span
                            title={`Plan override active — ${expiryLabel(r.overrideExpiresAt)}`}
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: HQ.green,
                            }}
                          />
                        )}
                      </span>
                    </td>
                    <td className="hqt-lo" style={{ padding: "10px 12px", color: HQ.inkDim, fontFamily: HQ_FM, fontSize: 11 }}>
                      {r.languageSummary}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {r.hasOwner ? (
                        <>
                          <div style={{ color: HQ.ink }}>{r.ownerName ?? "—"}</div>
                          <div
                            style={{
                              color: HQ.inkDim,
                              fontSize: 10.5,
                              fontFamily: HQ_FM,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 180,
                            }}
                          >
                            {r.ownerEmail ?? ""}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: HQ.red, fontSize: 11.5 }}>No owner</span>
                      )}
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        color: HQ.inkMuted,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {r.activeTalentCount}
                      <span style={{ color: HQ.inkDim }}> / {r.totalTalentCount}</span>
                    </td>
                    <td
                      className="hqt-lo"
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        color: HQ.inkMuted,
                      }}
                    >
                      {r.talentTypeCount}
                    </td>
                    <td
                      className="hqt-lo"
                      style={{
                        padding: "10px 12px",
                        textAlign: "right",
                        color: HQ.inkMuted,
                      }}
                    >
                      {r.staffCount}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <StatusDot status={r.status} />
                    </td>
                    <td
                      className="hqt-lo"
                      style={{ padding: "10px 12px", color: HQ.inkDim, fontSize: 11.5 }}
                    >
                      {r.createdAtLabel}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(r.id);
                        }}
                        style={{
                          padding: "5px 11px",
                          borderRadius: 7,
                          background: HQ.greenSoft,
                          border: "1px solid rgba(93,211,160,0.3)",
                          color: HQ.green,
                          fontSize: 11.5,
                          fontWeight: 600,
                          fontFamily: HQ_F,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <TenantDrawer tenantId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
