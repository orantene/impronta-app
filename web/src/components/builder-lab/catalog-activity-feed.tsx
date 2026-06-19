"use client";

/**
 * CatalogActivityFeed (Builder Lab → Activity) — G1.
 *
 * Reverse-chron audit feed of every super_admin governance write in the Lab
 * control-plane (overlay set/clear, template publish/unpublish/archive, rollout).
 * Rows come from `listBuilderLabAudit` (super_admin-gated; backed by the
 * `builder_lab_audit` table), each carrying who / what action / which item / when
 * plus a before→after JSON diff (expandable).
 *
 * Read-only — there is no write affordance here. The same `listBuilderLabAudit`
 * reader, scoped by `itemRef`/`templateId`, powers the per-row history popover in
 * the catalog row table.
 */

import { useEffect, useState } from "react";

import {
  listBuilderLabAudit,
  type BuilderLabAuditEntry,
} from "@/lib/site-admin/builder-core/templates/builder-lab-audit";
import { LAB as T, RADII, panelStyle, LabViewHeader, EmptyCard } from "./ui";

/** Human-readable label per audit action verb. */
const ACTION_LABEL: Record<string, string> = {
  "overlay.set": "Set overlay",
  "overlay.clear": "Cleared overlay",
  "template.publish": "Published template",
  "template.unpublish": "Unpublished template",
  "template.archive": "Archived template",
  "template.rollout": "Changed rollout",
};

function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

/** "el-button" / "db-template:<uuid>" / a template id → a compact display id. */
function targetLabel(entry: BuilderLabAuditEntry): string {
  if (entry.itemRef) return entry.itemRef;
  if (entry.templateId) return `template ${entry.templateId.slice(0, 8)}…`;
  return "—";
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Compact JSON for the before/after diff cells. */
function jsonPreview(value: unknown): string {
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function CatalogActivityFeed() {
  const [entries, setEntries] = useState<BuilderLabAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listBuilderLabAudit()
      .then((rows) => {
        if (active) setEntries(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      data-testid="lab-activity-root"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <LabViewHeader
        title="Activity"
        blurb="Every super-admin governance write in the Lab — overlay changes and template lifecycle — newest first, with a before/after diff. Read-only audit trail."
      />

      {loading ? (
        <EmptyCard>Loading recent activity…</EmptyCard>
      ) : entries.length === 0 ? (
        <EmptyCard>
          No governance activity recorded yet. Hiding a component, publishing a
          template, or changing a rollout will appear here.
        </EmptyCard>
      ) : (
        <div style={{ ...panelStyle, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                {["Action", "Item", "Who", "When", ""].map((h, i) => (
                  <th
                    key={h || "exp"}
                    style={{
                      textAlign: i === 4 ? "right" : "left",
                      padding: "9px 16px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: T.inkMuted,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const expanded = expandedId === e.id;
                return (
                  <tr
                    key={e.id}
                    data-testid={`lab-activity-row-${e.id}`}
                    style={{ borderBottom: `1px solid ${T.borderSoft}`, verticalAlign: "top" }}
                  >
                    <td style={{ padding: "9px 16px", color: T.ink, fontWeight: 600 }}>
                      {actionLabel(e.action)}
                    </td>
                    <td style={{ padding: "9px 16px", color: T.inkMuted, fontFamily: "ui-monospace, monospace", fontSize: 11.5 }}>
                      {targetLabel(e)}
                    </td>
                    <td style={{ padding: "9px 16px", color: T.inkMuted }}>
                      {e.actorName ?? (e.actorId ? `${e.actorId.slice(0, 8)}…` : "—")}
                    </td>
                    <td style={{ padding: "9px 16px", color: T.inkDim, whiteSpace: "nowrap" }}>
                      <span title={new Date(e.createdAt).toLocaleString()}>
                        {relativeTime(e.createdAt)}
                      </span>
                    </td>
                    <td style={{ padding: "9px 16px", textAlign: "right" }}>
                      <button
                        type="button"
                        data-testid={`lab-activity-diff-${e.id}`}
                        onClick={() => setExpandedId(expanded ? null : e.id)}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
                        style={{
                          background: "transparent",
                          border: "none",
                          color: T.accent,
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        aria-expanded={expanded}
                      >
                        {expanded ? "Hide diff" : "Diff"}
                      </button>
                      {expanded ? (
                        <div
                          style={{
                            marginTop: 8,
                            textAlign: "left",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          <DiffLine label="Before" value={e.before} muted />
                          <DiffLine label="After" value={e.after} />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DiffLine({
  label,
  value,
  muted,
}: {
  label: string;
  value: unknown;
  muted?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: muted ? T.inkDim : T.accent,
          minWidth: 44,
        }}
      >
        {label}
      </span>
      <code
        style={{
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          color: muted ? T.inkMuted : T.ink,
          background: T.cardSoft,
          borderRadius: RADII.icon,
          padding: "3px 7px",
          wordBreak: "break-all",
          flex: 1,
        }}
      >
        {jsonPreview(value)}
      </code>
    </div>
  );
}
