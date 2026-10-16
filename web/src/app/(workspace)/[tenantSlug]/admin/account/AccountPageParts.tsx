// Presentational pieces of the workspace Account & Billing page (design
// tokens, plan meta, section/detail rows, roster usage bar), split out of
// page.tsx for the file-size budget. Server-safe: no hooks, no "use client".

import type { WorkspacePlan } from "../../_data-bridge";

// ─── Design tokens (resolve to src/styles/admin-color-bridge.css, never page-local hex) ───
export const C = {
  ink:        "var(--color-admin-ink)",
  inkMuted:   "var(--color-admin-ink-muted)",
  inkDim:     "var(--color-admin-ink-dim)",
  border:     "var(--color-admin-border)",
  borderSoft: "var(--color-admin-border-soft)",
  cardBg:     "var(--color-admin-card)",
  surface:    "var(--color-admin-surface)",
  accent:     "var(--color-admin-brand)",
  accentSoft: "var(--color-admin-brand-soft)",
  green:      "var(--color-admin-green)",
  amber:      "var(--color-admin-amber)",
  amberSoft:  "var(--color-admin-amber-soft)",
} as const;

export const FONT = 'var(--font-admin-body, "Inter", system-ui, sans-serif)';

// ─── Plan meta ────────────────────────────────────────────────────────────────
export const PLAN_META: Record<WorkspacePlan, { label: string; bg: string; color: string }> = {
  free:    { label: "Free",    bg: "rgba(11,11,13,0.07)",    color: "rgba(11,11,13,0.55)" },
  website: { label: "Website", bg: "rgba(20,120,110,0.10)",  color: "#166F65" },
  studio:  { label: "Studio",  bg: "rgba(180,130,20,0.10)",  color: "var(--color-admin-amber)" },
  agency:  { label: "Agency",  bg: "rgba(30,80,160,0.10)",   color: "#2B5F8A" },
  network: { label: "Network", bg: "rgba(100,50,200,0.10)",  color: "#6B3EC2" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
export function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.7,
        textTransform: "uppercase" as const,
        color: C.inkDim,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        fontFamily: FONT,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 140,
          fontSize: 12,
          color: C.inkMuted,
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 500,
          color: C.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function RosterUsageBar({ count, limit, t }: { count: number; limit: number | null; t: (k: string) => string }) {
  if (limit === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 16px",
          fontFamily: FONT,
        }}
      >
        <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>{t("admin.account.rosterLabel")}</span>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
            {count}
          </span>
          <span style={{ fontSize: 12, color: C.inkMuted }}>{t("admin.account.ofUnlimited")}</span>
        </div>
      </div>
    );
  }

  const pct = limit > 0 ? Math.min((count / limit) * 100, 100) : 0;
  const nearLimit = pct >= 80;
  const barColor = nearLimit ? C.amber : C.accent;
  const countColor = nearLimit ? C.amber : C.ink;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 16px",
        fontFamily: FONT,
      }}
    >
      <span style={{ flexShrink: 0, width: 140, fontSize: 12, color: C.inkMuted }}>{t("admin.account.rosterLabel")}</span>
      <div className="flex-1 min-w-0">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: countColor,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {count}
          </span>
          <span style={{ fontSize: 12, color: C.inkMuted }}>{t("admin.account.of")} {limit}</span>
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 999,
            background: "rgba(11,11,13,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              borderRadius: 999,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function Divider() {
  return <div style={{ height: 1, background: C.borderSoft, margin: "0 16px" }} />;
}
