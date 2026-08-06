"use client";

import { useMemo, useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  filterAuditRows,
  isFailureAction,
  type DateRangeKey as AuditDateRangeKey,
} from "./filter";

export interface WorkspaceAuditRow {
  id: string;
  actorUserId: string | null;
  actorLabel: string | null;
  actorKind: string;
  action: string;
  category: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  country: string | null;
  userAgent: string | null;
  createdAtIso: string;
}

type Translate = (key: string) => string;

// Light tenant-admin palette (matches admin/financials — no gold accents).
const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const CATEGORY_ORDER = [
  "settings",
  "team",
  "roster",
  "media",
  "pages",
  "billing",
  "messages",
  "auth",
  "domain",
  "integration",
  "security",
  "system",
] as const;

const ACTOR_KINDS = ["staff", "talent", "client", "platform", "system", "guest"] as const;

// Soft chip tints per category — cool/neutral, security stands out.
const CATEGORY_TINT: Record<string, { fg: string; bg: string }> = {
  settings: { fg: "#1D4ED8", bg: "rgba(29,78,216,0.08)" },
  team: { fg: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
  roster: { fg: "#0F766E", bg: "rgba(15,118,110,0.08)" },
  media: { fg: "#4338CA", bg: "rgba(67,56,202,0.08)" },
  pages: { fg: "#2E7D5B", bg: "rgba(46,125,91,0.10)" },
  billing: { fg: "#B45309", bg: "rgba(180,83,9,0.10)" },
  messages: { fg: "#0369A1", bg: "rgba(3,105,161,0.08)" },
  auth: { fg: "#475569", bg: "rgba(71,85,105,0.08)" },
  domain: { fg: "#0E7490", bg: "rgba(14,116,144,0.08)" },
  integration: { fg: "#6D28D9", bg: "rgba(109,40,217,0.08)" },
  security: { fg: "#DC2626", bg: "rgba(220,38,38,0.08)" },
  system: { fg: "rgba(11,11,13,0.55)", bg: "rgba(11,11,13,0.05)" },
};

function categoryTint(category: string): { fg: string; bg: string } {
  return CATEGORY_TINT[category] ?? CATEGORY_TINT.system;
}

function flagEmoji(countryCode: string | null): string | null {
  if (!countryCode || countryCode.length !== 2) return null;
  const cc = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return String.fromCodePoint(
    0x1f1e6 + cc.charCodeAt(0) - 65,
    0x1f1e6 + cc.charCodeAt(1) - 65,
  );
}

function formatRelativeTime(iso: string, t: Translate): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return t("dashboard.platform.common.relJustNow");
  if (diffMins < 60)
    return interpolate(t("dashboard.platform.common.relMinsAgo"), { count: diffMins });
  if (diffHours < 24)
    return interpolate(t("dashboard.platform.common.relHoursAgo"), { count: diffHours });
  if (diffDays < 7)
    return interpolate(t("dashboard.platform.common.relDaysAgo"), { count: diffDays });
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

type DateRangeKey = AuditDateRangeKey;

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: FONT,
  background: C.cardBg,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  color: C.ink,
  boxSizing: "border-box",
};

const filterLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: C.inkMuted,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

export function ActivityLogClient({
  rows,
  loadedLimit,
  maxLimit,
}: {
  rows: WorkspaceAuditRow[];
  loadedLimit: number;
  maxLimit: number;
}) {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateRangeKey>("all");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const presentCategories = useMemo(() => {
    const present = new Set(rows.map((r) => r.category));
    return CATEGORY_ORDER.filter((c) => present.has(c));
  }, [rows]);

  const presentActorKinds = useMemo(() => {
    const present = new Set(rows.map((r) => r.actorKind));
    return ACTOR_KINDS.filter((k) => present.has(k));
  }, [rows]);

  const filteredRows = useMemo(
    () =>
      filterAuditRows(rows, {
        search: searchQuery,
        category: categoryFilter,
        actorKind: actorFilter,
        dateRange: dateFilter,
      }),
    [rows, searchQuery, categoryFilter, actorFilter, dateFilter],
  );

  const categoryName = (c: string) => t(`dashboard.adminActivityLog.category.${c}`);
  const actorKindName = (k: string) => t(`dashboard.adminActivityLog.actor.${k}`);

  return (
    <div style={{ fontFamily: FONT, maxWidth: 1080 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 650,
            letterSpacing: -0.4,
            color: C.ink,
            margin: "0 0 6px",
          }}
        >
          {t("dashboard.adminActivityLog.title")}
        </h1>
        <p style={{ color: C.inkMuted, margin: 0, fontSize: 14, maxWidth: 640 }}>
          {t("dashboard.adminActivityLog.subtitle")}
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div>
          <label htmlFor="wal-search" style={filterLabelStyle}>
            {t("dashboard.adminActivityLog.searchLabel")}
          </label>
          <input
            id="wal-search"
            type="text"
            placeholder={t("dashboard.adminActivityLog.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="wal-category" style={filterLabelStyle}>
            {t("dashboard.adminActivityLog.categoryLabel")}
          </label>
          <select
            id="wal-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">{t("dashboard.adminActivityLog.allCategories")}</option>
            {presentCategories.map((c) => (
              <option key={c} value={c}>
                {categoryName(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="wal-actor" style={filterLabelStyle}>
            {t("dashboard.adminActivityLog.actorLabel")}
          </label>
          <select
            id="wal-actor"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            style={inputStyle}
          >
            <option value="all">{t("dashboard.adminActivityLog.allActors")}</option>
            {presentActorKinds.map((k) => (
              <option key={k} value={k}>
                {actorKindName(k)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="wal-date" style={filterLabelStyle}>
            {t("dashboard.adminActivityLog.dateLabel")}
          </label>
          <select
            id="wal-date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateRangeKey)}
            style={inputStyle}
          >
            <option value="all">{t("dashboard.adminActivityLog.allTime")}</option>
            <option value="24h">{t("dashboard.adminActivityLog.last24h")}</option>
            <option value="7d">{t("dashboard.adminActivityLog.last7d")}</option>
            <option value="30d">{t("dashboard.adminActivityLog.last30d")}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.surface }}>
                {[
                  t("dashboard.adminActivityLog.colTime"),
                  t("dashboard.adminActivityLog.colActor"),
                  t("dashboard.adminActivityLog.colEvent"),
                  t("dashboard.adminActivityLog.colTarget"),
                  t("dashboard.adminActivityLog.colLocation"),
                ].map((label) => (
                  <th
                    key={label}
                    style={{
                      textAlign: "left",
                      padding: "10px 14px",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      color: C.inkMuted,
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "36px 14px", textAlign: "center", color: C.inkDim }}>
                    {rows.length === 0
                      ? t("dashboard.adminActivityLog.empty")
                      : t("dashboard.adminActivityLog.emptyFiltered")}
                  </td>
                </tr>
              )}
              {filteredRows.map((row) => {
                const tint = categoryTint(row.category);
                const expanded = expandedRowId === row.id;
                const flag = flagEmoji(row.country);
                return (
                  <FragmentRow
                    key={row.id}
                    row={row}
                    tint={tint}
                    expanded={expanded}
                    flag={flag}
                    t={t}
                    categoryName={categoryName}
                    actorKindName={actorKindName}
                    onToggle={() => setExpandedRowId(expanded ? null : row.id)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer: count + load more */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 12,
          fontSize: 12,
          color: C.inkMuted,
        }}
      >
        <span>
          {interpolate(t("dashboard.adminActivityLog.showing"), {
            shown: filteredRows.length,
            total: rows.length,
          })}
        </span>
        {rows.length >= loadedLimit && loadedLimit < maxLimit && (
          <a
            href={`?limit=${Math.min(loadedLimit * 2, maxLimit)}`}
            style={{ color: C.accent, fontWeight: 600, textDecoration: "none" }}
          >
            {t("dashboard.adminActivityLog.loadMore")}
          </a>
        )}
      </div>
    </div>
  );
}

function FragmentRow({
  row,
  tint,
  expanded,
  flag,
  t,
  categoryName,
  actorKindName,
  onToggle,
}: {
  row: WorkspaceAuditRow;
  tint: { fg: string; bg: string };
  expanded: boolean;
  flag: string | null;
  t: Translate;
  categoryName: (c: string) => string;
  actorKindName: (k: string) => string;
  onToggle: () => void;
}) {
  const cellStyle: React.CSSProperties = {
    padding: "11px 14px",
    borderBottom: `1px solid ${C.borderSoft}`,
    verticalAlign: "top",
  };
  const metadataEntries = Object.entries(row.metadata ?? {});
  const failed = isFailureAction(row.action);
  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          cursor: "pointer",
          background: expanded ? C.surface : failed ? "rgba(220,38,38,0.03)" : undefined,
        }}
      >
        <td style={{ ...cellStyle, whiteSpace: "nowrap", color: C.inkMuted }}>
          {formatRelativeTime(row.createdAtIso, t)}
        </td>
        <td style={cellStyle}>
          <div style={{ fontWeight: 600, color: C.ink }}>
            {row.actorLabel ?? actorKindName(row.actorKind)}
          </div>
          <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>
            {actorKindName(row.actorKind)}
          </div>
        </td>
        <td style={cellStyle}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: tint.fg,
                background: tint.bg,
                borderRadius: 999,
                padding: "2px 8px",
                whiteSpace: "nowrap",
              }}
            >
              {categoryName(row.category)}
            </span>
            {failed && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#DC2626",
                  background: "rgba(220,38,38,0.08)",
                  borderRadius: 999,
                  padding: "2px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                {t("dashboard.adminActivityLog.failedBadge")}
              </span>
            )}
            <span style={{ color: C.ink, minWidth: 180, flex: 1 }}>
              {row.summary ?? row.action}
            </span>
          </div>
        </td>
        <td style={{ ...cellStyle, color: C.inkMuted, maxWidth: 200 }}>
          <span style={{ overflowWrap: "anywhere" }}>
            {row.targetLabel ?? (row.targetType ? row.targetType : "—")}
          </span>
        </td>
        <td style={{ ...cellStyle, whiteSpace: "nowrap", color: C.inkMuted }}>
          {flag ? `${flag} ` : ""}
          {row.ipAddress ?? "—"}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: C.surface }}>
          <td colSpan={5} style={{ ...cellStyle, padding: "14px 18px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "10px 24px",
                fontSize: 12,
              }}
            >
              <DetailItem label={t("dashboard.adminActivityLog.detailAction")} value={row.action} mono />
              <DetailItem
                label={t("dashboard.adminActivityLog.detailTarget")}
                value={
                  row.targetType || row.targetId
                    ? `${row.targetType ?? ""}${row.targetType && row.targetId ? " · " : ""}${row.targetId ?? ""}`
                    : null
                }
                mono
              />
              <DetailItem
                label={t("dashboard.adminActivityLog.detailTime")}
                value={new Date(row.createdAtIso).toLocaleString()}
              />
              <DetailItem label={t("dashboard.adminActivityLog.detailIp")} value={row.ipAddress} mono />
              <DetailItem
                label={t("dashboard.adminActivityLog.detailCountry")}
                value={row.country ? `${flag ? `${flag} ` : ""}${row.country}` : null}
              />
              <DetailItem
                label={t("dashboard.adminActivityLog.detailUserAgent")}
                value={row.userAgent}
              />
            </div>
            {metadataEntries.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ ...filterLabelStyle, marginBottom: 4 }}>
                  {t("dashboard.adminActivityLog.detailMetadata")}
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: "10px 12px",
                    background: C.cardBg,
                    border: `1px solid ${C.borderSoft}`,
                    borderRadius: 8,
                    fontSize: 11.5,
                    overflowX: "auto",
                    color: C.inkMuted,
                  }}
                >
                  {JSON.stringify(row.metadata, null, 2)}
                </pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function DetailItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={filterLabelStyle}>{label}</div>
      <div
        style={{
          color: C.ink,
          overflowWrap: "anywhere",
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          fontSize: mono ? 11.5 : 12,
        }}
      >
        {value}
      </div>
    </div>
  );
}
