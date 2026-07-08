"use client";

/**
 * Platform Admin — interactive tenants table.
 *
 * Client-side search / filter / sort over the workspace list (the platform
 * is small enough that client-side is correct; virtualization is a scale
 * follow-up). Rows open the management drawer; the name links to the full
 * detail page.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  HQ,
  HQ_F,
  HQ_FM,
  PlanChip,
  StatusDot,
  EntityChip,
  PLAN_TIER_LABEL_KEY,
  WORKSPACE_STATUS_LABEL_KEY,
} from "./hq-kit";
import { TenantDrawer } from "./TenantDrawer";
import { PLAN_TIER_RANK } from "@/lib/platform/plan-override";
import type { PlatformTenantListRow } from "../../tenant-management-data";
import { actionCreateTenant } from "./actions-control";
import { byName } from "@/lib/field-engine/sort-comparators";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;

function planLabel(t: Translate, plan: string): string {
  const key = PLAN_TIER_LABEL_KEY[plan];
  return key ? t(key) : plan;
}

function entityLabel(t: Translate, entityType: string): string {
  return entityType === "hub"
    ? t("dashboard.platform.tenants.entity.hub")
    : t("dashboard.platform.tenants.entity.agency");
}

function statusLabel(t: Translate, status: string): string {
  const key = WORKSPACE_STATUS_LABEL_KEY[status];
  return key ? t(key) : status;
}

// ─── Create workspace modal ───────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: HQ.card,
  border: `1px solid ${HQ.border}`,
  borderRadius: 8,
  color: HQ.ink,
  fontSize: 12.5,
  fontFamily: HQ_F,
  padding: "8px 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function CreateWorkspaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT();
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [kind, setKind] = useState("agency");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(v: string) {
    setDisplayName(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await actionCreateTenant({ displayName, slug, kind, ownerEmail: ownerEmail || null });
      if (res.ok) { onCreated(res.data.id); }
      else setError(res.error);
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div
        style={{
          position: "relative",
          width: "min(460px, 94vw)",
          background: HQ.bg,
          border: `1px solid ${HQ.border}`,
          borderRadius: 14,
          padding: "20px",
          fontFamily: HQ_F,
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: HQ.ink }}>{t("dashboard.platform.tenants.createTitle")}</span>
          <button type="button" onClick={onClose} aria-label={t("dashboard.platform.tenants.cancel")} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${HQ.borderSoft}`, background: "transparent", color: HQ.inkMuted, cursor: "pointer", fontSize: 13 }}>✕</button>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: HQ.inkMuted }}>
          {t("dashboard.platform.tenants.fieldDisplayName")} *
          <input
            type="text"
            placeholder={t("dashboard.platform.tenants.fieldDisplayNamePlaceholder")}
            value={displayName}
            disabled={pending}
            onChange={(e) => handleNameChange(e.target.value)}
            style={inputStyle}
            autoFocus
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: HQ.inkMuted }}>
          {t("dashboard.platform.tenants.fieldSlug")} * <span style={{ fontFamily: HQ_FM, fontSize: 10 }}>{t("dashboard.platform.tenants.fieldSlugHint")}</span>
          <input
            type="text"
            placeholder={t("dashboard.platform.tenants.fieldSlugPlaceholder")}
            value={slug}
            disabled={pending}
            onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
            style={{ ...inputStyle, fontFamily: HQ_FM }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: HQ.inkMuted }}>
          {t("dashboard.platform.tenants.fieldWorkspaceType")}
          <select value={kind} disabled={pending} onChange={(e) => setKind(e.target.value)} style={inputStyle}>
            <option value="agency">{t("dashboard.platform.tier.agency")}</option>
            <option value="hub">Hub</option>
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: HQ.inkMuted }}>
          {t("dashboard.platform.tenants.fieldOwnerEmail")} <span style={{ color: HQ.inkDim }}>{t("dashboard.platform.tenants.fieldOwnerEmailHint")}</span>
          <input
            type="email"
            placeholder={t("dashboard.platform.tenants.fieldOwnerEmailPlaceholder")}
            value={ownerEmail}
            disabled={pending}
            onChange={(e) => setOwnerEmail(e.target.value)}
            style={inputStyle}
          />
        </label>

        {error && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: HQ.redSoft, color: HQ.red, fontSize: 12.5 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={pending} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${HQ.borderSoft}`, background: "transparent", color: HQ.inkMuted, fontSize: 12.5, fontFamily: HQ_F, cursor: "pointer" }}>
            {t("dashboard.platform.tenants.cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !displayName.trim() || !slug.trim()}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "none",
              background: HQ.green,
              color: "#0F0F11",
              fontSize: 12.5,
              fontWeight: 700,
              fontFamily: HQ_F,
              cursor: pending ? "default" : "pointer",
              opacity: (pending || !displayName.trim() || !slug.trim()) ? 0.5 : 1,
            }}
          >
            {pending ? t("dashboard.platform.tenants.creating") : t("dashboard.platform.tenants.createTitle")}
          </button>
        </div>
      </div>
    </div>
  );
}

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

function expiryLabel(iso: string | null, t: Translate): string {
  if (!iso) return t("dashboard.platform.tenants.expiryNone");
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (Number.isNaN(days)) return t("dashboard.platform.tenants.expiryExpires");
  if (days < 0) return t("dashboard.platform.tenants.expiryExpired");
  if (days === 0) return t("dashboard.platform.tenants.expiryToday");
  return interpolate(t("dashboard.platform.tenants.expiryDaysLeft"), { count: days });
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
  const t = useT();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [entity, setEntity] = useState("all");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [override, setOverride] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // Tenants whose override dot was just cleared in-drawer; suppress the dot
  // until router.refresh() lands fresh server rows, which reconcile reality.
  const [clearedOverrides, setClearedOverrides] = useState<Set<string>>(() => new Set());

  // Fresh server rows arrived — drop optimistic suppression and trust the data.
  useEffect(() => {
    setClearedOverrides((prev) => (prev.size === 0 ? prev : new Set()));
  }, [rows]);

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
          cmp = byName(a, b);
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
          placeholder={t("dashboard.platform.tenants.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            ...selectStyle,
            flex: "1 1 240px",
            padding: "7px 10px",
          }}
        />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} style={selectStyle}>
          <option value="all">{t("dashboard.platform.tenants.filterAllPlans")}</option>
          <option value="free">{t("dashboard.platform.tier.free")}</option>
          <option value="studio">{t("dashboard.platform.tier.studio")}</option>
          <option value="agency">{t("dashboard.platform.tier.agency")}</option>
          <option value="network">{t("dashboard.platform.tier.network")}</option>
        </select>
        <select value={entity} onChange={(e) => setEntity(e.target.value)} style={selectStyle}>
          <option value="all">{t("dashboard.platform.tenants.filterAllTypes")}</option>
          <option value="agency">{t("dashboard.platform.tier.agency")}</option>
          <option value="hub">Hub</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          <option value="all">{t("dashboard.platform.tenants.filterAllStatuses")}</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {statusLabel(t, s)}
            </option>
          ))}
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} style={selectStyle}>
          <option value="all">{t("dashboard.platform.tenants.filterOwnerAny")}</option>
          <option value="has">{t("dashboard.platform.tenants.filterOwnerAssigned")}</option>
          <option value="missing">{t("dashboard.platform.tenants.filterOwnerMissing")}</option>
        </select>
        <select value={override} onChange={(e) => setOverride(e.target.value)} style={selectStyle}>
          <option value="all">{t("dashboard.platform.tenants.filterOverrideAny")}</option>
          <option value="active">{t("dashboard.platform.tenants.filterOverrideActive")}</option>
          <option value="none">{t("dashboard.platform.tenants.filterOverrideNone")}</option>
        </select>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          style={{
            padding: "7px 14px",
            borderRadius: 8,
            border: "none",
            background: HQ.green,
            color: "#0F0F11",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: HQ_F,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {t("dashboard.platform.tenants.newWorkspace")}
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: HQ.inkDim, marginBottom: 8, fontFamily: HQ_F }}>
        {interpolate(
          t(
            rows.length === 1
              ? "dashboard.platform.tenants.countOfWorkspacesOne"
              : "dashboard.platform.tenants.countOfWorkspacesOther",
          ),
          { filtered: filtered.length, total: rows.length },
        )}
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
                <Th label={t("dashboard.platform.tenants.colWorkspace")} column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label={t("dashboard.platform.tenants.colType")} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label={t("dashboard.platform.tenants.colPlan")} column="plan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label={t("dashboard.platform.tenants.colLanguage")} lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label={t("dashboard.platform.tenants.colOwner")} column="owner" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label={t("dashboard.platform.tenants.colTalents")} column="talents" align="right" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label={t("dashboard.platform.tenants.colTypes")} align="right" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label={t("dashboard.platform.tenants.colStaff")} column="staff" align="right" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label={t("dashboard.platform.tenants.colStatus")} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <Th label={t("dashboard.platform.tenants.colCreated")} column="created" lo sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
                      ? t("dashboard.platform.tenants.emptyNoWorkspaces")
                      : t("dashboard.platform.tenants.emptyNoMatch")}
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
                      <EntityChip entityType={r.entityType} label={entityLabel(t, r.entityType)} />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <PlanChip plan={r.plan} label={planLabel(t, r.plan)} />
                        {r.hasActiveOverride && !clearedOverrides.has(r.id) && (
                          <span
                            title={`${t("dashboard.platform.tenants.overrideActiveTitle")} · ${expiryLabel(r.overrideExpiresAt, t)}`}
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
                        <span style={{ color: HQ.red, fontSize: 11.5 }}>{t("dashboard.platform.tenants.noOwner")}</span>
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
                      <StatusDot status={r.status} label={statusLabel(t, r.status)} />
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
                        {t("dashboard.platform.tenants.manage")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <TenantDrawer
        tenantId={openId}
        onClose={() => setOpenId(null)}
        onChanged={(id) =>
          setClearedOverrides((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          })
        }
      />
      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            router.refresh();
            setOpenId(id);
          }}
        />
      )}
    </>
  );
}
