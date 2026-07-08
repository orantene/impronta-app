"use client";

import { useState, useMemo } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { PlatformAuditLogRow } from "../../platform-data";

type Translate = (key: string) => string;

// Design tokens (match HQ dark theme)
const HQ = {
  bg: "#0F0F11",
  card: "#16161A",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  accentGreen: "#5DD3A0",
  red: "#F36772",
} as const;

const FONT_BODY = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

// Relative time formatter
function formatRelativeTime(iso: string, t: Translate): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("dashboard.platform.common.relJustNow");
  if (diffMins < 60) return interpolate(t("dashboard.platform.common.relMinsAgo"), { count: diffMins });
  if (diffHours < 24) return interpolate(t("dashboard.platform.common.relHoursAgo"), { count: diffHours });
  if (diffDays < 7) return interpolate(t("dashboard.platform.common.relDaysAgo"), { count: diffDays });
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

// Date filter helper
function isWithinDays(iso: string, days: number | null): boolean {
  if (!days) return true;
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  return diffMs <= days * 86400000;
}

type DateRangeKey = "all" | "24h" | "7d" | "30d";

interface AuditLogClientProps {
  rows: PlatformAuditLogRow[];
}

export function AuditLogClient({ rows }: AuditLogClientProps) {
  const t = useT();
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [targetKindFilter, setTargetKindFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateRangeKey>("all");
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Extract unique values for dropdowns
  const uniqueActions = useMemo(() => {
    const actions = new Set(rows.map((r) => r.action).filter(Boolean));
    return Array.from(actions).sort();
  }, [rows]);

  const targetKinds = ["profile", "talent_profile", "workspace", "membership"];

  // Filter logic
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Date filter
      const dayLimit =
        dateFilter === "24h" ? 1 : dateFilter === "7d" ? 7 : dateFilter === "30d" ? 30 : null;
      if (!isWithinDays(row.createdAtIso, dayLimit)) return false;

      // Action filter
      if (actionFilter !== "all" && row.action !== actionFilter) return false;

      // Target kind filter
      if (targetKindFilter !== "all" && row.targetKind !== targetKindFilter)
        return false;

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const searchable = [
          row.actorDisplayName,
          row.targetId,
          row.action,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }

      return true;
    });
  }, [rows, searchQuery, actionFilter, targetKindFilter, dateFilter]);

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: -0.5,
            color: HQ.ink,
            margin: "0 0 8px",
          }}
        >
          {t("dashboard.platform.auditLog.title")}
        </h1>
        <p style={{ color: HQ.inkMuted, margin: 0, fontSize: 14 }}>
          {t("dashboard.platform.auditLog.subtitle")}
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {/* Search */}
        <div>
          <label
            htmlFor="search"
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: HQ.inkMuted,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {t("dashboard.platform.auditLog.searchLabel")}
          </label>
          <input
            id="search"
            type="text"
            placeholder={t("dashboard.platform.auditLog.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: FONT_BODY,
              background: HQ.card,
              border: `1px solid ${HQ.border}`,
              borderRadius: 6,
              color: HQ.ink,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Action filter */}
        <div>
          <label
            htmlFor="action"
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: HQ.inkMuted,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {t("dashboard.platform.auditLog.actionLabel")}
          </label>
          <select
            id="action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: FONT_BODY,
              background: HQ.card,
              border: `1px solid ${HQ.border}`,
              borderRadius: 6,
              color: HQ.ink,
              boxSizing: "border-box",
            }}
          >
            <option value="all">{t("dashboard.platform.auditLog.allActions")}</option>
            {uniqueActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>

        {/* Target kind filter */}
        <div>
          <label
            htmlFor="targetKind"
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: HQ.inkMuted,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {t("dashboard.platform.auditLog.targetKindLabel")}
          </label>
          <select
            id="targetKind"
            value={targetKindFilter}
            onChange={(e) => setTargetKindFilter(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: FONT_BODY,
              background: HQ.card,
              border: `1px solid ${HQ.border}`,
              borderRadius: 6,
              color: HQ.ink,
              boxSizing: "border-box",
            }}
          >
            <option value="all">{t("dashboard.platform.auditLog.all")}</option>
            {targetKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>

        {/* Date filter */}
        <div>
          <label
            htmlFor="dateRange"
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: HQ.inkMuted,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {t("dashboard.platform.auditLog.dateRangeLabel")}
          </label>
          <select
            id="dateRange"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateRangeKey)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: FONT_BODY,
              background: HQ.card,
              border: `1px solid ${HQ.border}`,
              borderRadius: 6,
              color: HQ.ink,
              boxSizing: "border-box",
            }}
          >
            <option value="all">{t("dashboard.platform.auditLog.dateAll")}</option>
            <option value="24h">{t("dashboard.platform.auditLog.date24h")}</option>
            <option value="7d">{t("dashboard.platform.auditLog.date7d")}</option>
            <option value="30d">{t("dashboard.platform.auditLog.date30d")}</option>
          </select>
        </div>
      </div>

      {/* Empty state */}
      {filteredRows.length === 0 ? (
        <div
          style={{
            padding: "40px 24px",
            textAlign: "center",
            background: HQ.card,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 8,
          }}
        >
          <p style={{ color: HQ.inkMuted, margin: 0, fontSize: 14 }}>
            {t("dashboard.platform.auditLog.empty")}
          </p>
        </div>
      ) : (
        /* Table */
        <div
          style={{
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr style={{ background: HQ.card, borderBottom: `1px solid ${HQ.borderSoft}` }}>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: HQ.inkMuted,
                    textTransform: "uppercase",
                    fontSize: 11,
                    letterSpacing: 0.5,
                  }}
                >
                  {t("dashboard.platform.auditLog.colWhen")}
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: HQ.inkMuted,
                    textTransform: "uppercase",
                    fontSize: 11,
                    letterSpacing: 0.5,
                  }}
                >
                  {t("dashboard.platform.auditLog.colActor")}
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: HQ.inkMuted,
                    textTransform: "uppercase",
                    fontSize: 11,
                    letterSpacing: 0.5,
                  }}
                >
                  {t("dashboard.platform.auditLog.colTarget")}
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: HQ.inkMuted,
                    textTransform: "uppercase",
                    fontSize: 11,
                    letterSpacing: 0.5,
                  }}
                >
                  {t("dashboard.platform.auditLog.colAction")}
                </th>
                <th
                  style={{
                    padding: "12px",
                    textAlign: "left",
                    fontWeight: 600,
                    color: HQ.inkMuted,
                    textTransform: "uppercase",
                    fontSize: 11,
                    letterSpacing: 0.5,
                  }}
                >
                  {t("dashboard.platform.auditLog.colDetails")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isExpanded = expandedRowId === row.id;

                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: `1px solid ${HQ.borderSoft}`,
                      background: isExpanded ? "rgba(93,211,160,0.04)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px", color: HQ.inkMuted }}>
                      {formatRelativeTime(row.createdAtIso, t)}
                    </td>
                    <td style={{ padding: "12px", color: HQ.ink }}>
                      {row.actorDisplayName}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        color: HQ.inkMuted,
                        fontFamily: '"SF Mono", Monaco, monospace',
                        fontSize: 12,
                      }}
                    >
                      {row.targetKind ? (
                        <span>
                          {row.targetKind} · {row.targetId?.slice(0, 12)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        color: HQ.ink,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          background: "rgba(93,211,160,0.15)",
                          color: HQ.accentGreen,
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {row.action}
                      </span>
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      <button
                        onClick={() =>
                          setExpandedRowId(isExpanded ? null : row.id)
                        }
                        style={{
                          background: "transparent",
                          border: "none",
                          color: HQ.accentGreen,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                          padding: "4px 8px",
                          borderRadius: 4,
                          transition: "background 150ms",
                        }}
                        onMouseEnter={(e) => {
                          (e.target as HTMLElement).style.background =
                            "rgba(93,211,160,0.12)";
                        }}
                        onMouseLeave={(e) => {
                          (e.target as HTMLElement).style.background =
                            "transparent";
                        }}
                      >
                        {isExpanded ? "−" : "+"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Expanded row details */}
          {expandedRowId && (
            <div style={{ borderTop: `1px solid ${HQ.borderSoft}` }}>
              {filteredRows
                .filter((r) => r.id === expandedRowId)
                .map((row) => (
                  <div
                    key={`details-${row.id}`}
                    style={{
                      padding: "16px",
                      background: HQ.card,
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      {row.beforeJsonb && (
                        <div>
                          <h4
                            style={{
                              margin: "0 0 8px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: HQ.accentGreen,
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                            }}
                          >
                            {t("dashboard.platform.auditLog.before")}
                          </h4>
                          <pre
                            style={{
                              margin: 0,
                              padding: "8px",
                              background: "rgba(0,0,0,0.2)",
                              border: `1px solid ${HQ.borderSoft}`,
                              borderRadius: 4,
                              fontSize: 11,
                              color: HQ.inkMuted,
                              fontFamily: '"SF Mono", Monaco, monospace',
                              overflowX: "auto",
                              maxHeight: 200,
                              overflowY: "auto",
                            }}
                          >
                            {JSON.stringify(row.beforeJsonb, null, 2)}
                          </pre>
                        </div>
                      )}
                      {row.afterJsonb && (
                        <div>
                          <h4
                            style={{
                              margin: "0 0 8px",
                              fontSize: 12,
                              fontWeight: 600,
                              color: HQ.accentGreen,
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                            }}
                          >
                            {t("dashboard.platform.auditLog.after")}
                          </h4>
                          <pre
                            style={{
                              margin: 0,
                              padding: "8px",
                              background: "rgba(0,0,0,0.2)",
                              border: `1px solid ${HQ.borderSoft}`,
                              borderRadius: 4,
                              fontSize: 11,
                              color: HQ.inkMuted,
                              fontFamily: '"SF Mono", Monaco, monospace',
                              overflowX: "auto",
                              maxHeight: 200,
                              overflowY: "auto",
                            }}
                          >
                            {JSON.stringify(row.afterJsonb, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                    {row.contextJsonb && (
                      <div style={{ marginTop: 16 }}>
                        <h4
                          style={{
                            margin: "0 0 8px",
                            fontSize: 12,
                            fontWeight: 600,
                            color: HQ.accentGreen,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {t("dashboard.platform.auditLog.context")}
                        </h4>
                        <pre
                          style={{
                            margin: 0,
                            padding: "8px",
                            background: "rgba(0,0,0,0.2)",
                            border: `1px solid ${HQ.borderSoft}`,
                            borderRadius: 4,
                            fontSize: 11,
                            color: HQ.inkMuted,
                            fontFamily: '"SF Mono", Monaco, monospace',
                            overflowX: "auto",
                            maxHeight: 200,
                            overflowY: "auto",
                          }}
                        >
                          {JSON.stringify(row.contextJsonb, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Result count */}
      <div style={{ marginTop: 16, color: HQ.inkMuted, fontSize: 12 }}>
        {interpolate(t("dashboard.platform.auditLog.showing"), {
          shown: filteredRows.length,
          total: rows.length,
        })}
      </div>
    </div>
  );
}
