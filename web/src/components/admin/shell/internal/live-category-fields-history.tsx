"use client";
import { logServerError } from "@/lib/server/safe-error";

// ============================================================================
// live-category-fields-history.tsx — Audit modal for the per-talent field
// catalog. Surfaces the rows captured by the trigger created in
// 20260923040000_field_values_history.sql so admins can see who changed
// what, when, and what the previous value was.
//
// Triggered from a small "history" link in the LiveCategoryFieldsEditor
// header. Read-only (no rollback in this slice — undo button is Tier D
// in the closure plan).
// ============================================================================

import { useEffect, useState } from "react";
import {
  getTalentFieldValueHistory,
  type TalentFieldHistoryRow,
} from "@/lib/server-actions/admin-talent-field-values";

const T = {
  ink: "#0B0B0D",
  inkMuted: "#5A5A60",
  inkDim: "rgba(11,11,13,0.38)",
  surface: "#FFFFFF",
  surfaceAlt: "#F4F2EB",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  red: "#C82828",
  amber: "#B88731",
};

const F = "Inter, system-ui, sans-serif";

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 80 ? `${v.slice(0, 77)}…` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.join(", ").slice(0, 80);
  return JSON.stringify(v).slice(0, 80);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

// Exact date + time of the change (audit needs the precise stamp, not
// just "3d ago").
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function operationColor(op: TalentFieldHistoryRow["operation"]): string {
  if (op === "INSERT") return T.accent;
  if (op === "UPDATE") return T.amber;
  return T.red;
}

export function LiveCategoryFieldsHistoryModal({
  talentProfileId,
  open,
  onClose,
}: {
  talentProfileId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<TalentFieldHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const res = await getTalentFieldValueHistory({
          talent_profile_id: talentProfileId,
          limit: 100,
        });
        if (cancelled) return;
        if (res.ok) setRows(res.rows);
        else { setError(res.error); setRows([]); }
      } catch (err) {
        if (cancelled) return;
        logServerError("livecategoryfieldshistorymodal", err);
        setError(err instanceof Error ? err.message : "Failed to load history.");
        setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, talentProfileId]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Field value history"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(11,11,13,0.40)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "5vh 16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 720, maxHeight: "85vh",
          background: "#fff", borderRadius: 14,
          boxShadow: "0 16px 40px rgba(11,11,13,0.20)",
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: F,
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: `1px solid ${T.borderSoft}`,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>
              Profile-fields history
            </div>
            <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>
              Last 100 changes · before / after / when / by whom
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close history"
            style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 20, lineHeight: 1, color: T.inkMuted, padding: 4,
            }}
          >×</button>
        </div>
        <div style={{ overflow: "auto", padding: "8px 0" }}>
          {rows === null && (
            <div style={{ padding: 18, fontSize: 12, color: T.inkMuted }}>Loading…</div>
          )}
          {error && (
            <div style={{
              margin: 14, padding: 10, borderRadius: 8,
              background: "rgba(200,40,40,0.06)", borderLeft: `3px solid ${T.red}`,
              fontSize: 12, color: T.red,
            }}>{error}</div>
          )}
          {rows && rows.length === 0 && !error && (
            <div style={{ padding: 18, fontSize: 12, color: T.inkMuted }}>
              No changes recorded yet.
            </div>
          )}
          {rows && rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {rows.map((r) => (
                <div key={r.id} style={{
                  padding: "10px 18px",
                  borderBottom: `1px solid ${T.borderSoft}`,
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) auto",
                  gap: 12,
                  alignItems: "start",
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontSize: 12.5, fontWeight: 600, color: T.ink,
                      marginBottom: 4,
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px",
                        borderRadius: 4, background: "rgba(11,11,13,0.05)",
                        color: operationColor(r.operation), letterSpacing: 0.4,
                      }}>{r.operation}</span>
                      {r.field_label}
                      <span style={{
                        fontSize: 10, fontWeight: 500, color: T.inkDim,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}>· {r.field_key}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11.5, color: T.inkMuted, minWidth: 60 }}>before</span>
                      <span style={{
                        fontSize: 12, color: T.ink, padding: "2px 6px",
                        background: T.surfaceAlt, borderRadius: 4,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}>{formatValue(r.before_value)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", marginTop: 3 }}>
                      <span style={{ fontSize: 11.5, color: T.inkMuted, minWidth: 60 }}>after</span>
                      <span style={{
                        fontSize: 12, color: T.ink, padding: "2px 6px",
                        background: T.accentSoft, borderRadius: 4,
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}>{formatValue(r.after_value)}</span>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10.5, color: T.inkMuted, textAlign: "right",
                    whiteSpace: "nowrap",
                  }}>
                    <div style={{ color: T.ink, fontWeight: 600 }}>
                      {formatDateTime(r.changed_at)}
                    </div>
                    <div style={{ marginTop: 2 }}>{formatTime(r.changed_at)}</div>
                    <div style={{ marginTop: 2, textTransform: "capitalize" }}>
                      {r.actor_role ?? "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
