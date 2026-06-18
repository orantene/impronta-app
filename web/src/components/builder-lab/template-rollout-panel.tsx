"use client";

/**
 * RolloutPanel (Builder Studio WS-D D3) — the staged-rollout control for one
 * builder template, extracted from template-manager.tsx to keep that file under
 * the 800-line cap. A super-admin sets the canary `rollout_percentage` (0-100)
 * plus an explicit allow / deny list of tenant ids; persistence is the
 * `setTemplateRollout` action wired by the Template Manager.
 *
 * `rolloutSummary` renders the at-rest rule as a compact pill string.
 */

import { useState } from "react";

import type {
  BuilderTemplateRow,
  SetTemplateRolloutInput,
} from "@/lib/site-admin/builder-core/templates/registry-rows";

const T = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  accent: "#5DD3A0",
};

/** Compact "rollout 60% · allow 2 · deny 1" summary for the row pill. */
export function rolloutSummary(row: BuilderTemplateRow): string {
  const pct = row.rollout_percentage ?? 100;
  const allow = row.tenant_allowlist?.length ?? 0;
  const deny = row.tenant_denylist?.length ?? 0;
  const parts = [`rollout ${pct}%`];
  if (allow > 0) parts.push(`allow ${allow}`);
  if (deny > 0) parts.push(`deny ${deny}`);
  return parts.join(" · ");
}

/** True when a template has any non-default rollout setting
 *  (percentage < 100, or a non-empty allow/deny list). Used for the
 *  "partially rolled out" filter in Template Manager + Starter Kit. */
export function isPartialRollout(row: BuilderTemplateRow): boolean {
  const pct = row.rollout_percentage ?? 100;
  const allow = row.tenant_allowlist?.length ?? 0;
  const deny = row.tenant_denylist?.length ?? 0;
  return pct < 100 || allow > 0 || deny > 0;
}

/** Chip label for the at-rest rollout state shown per-row.
 *  Returns null when fully rolled out (100% / 0 allow / 0 deny) so the
 *  chip is omitted entirely — a quiet row means "everyone gets this". */
export function rolloutChipText(row: BuilderTemplateRow): string | null {
  if (!isPartialRollout(row)) return null;
  const pct = row.rollout_percentage ?? 100;
  const allow = row.tenant_allowlist?.length ?? 0;
  const deny = row.tenant_denylist?.length ?? 0;
  const parts: string[] = [`${pct}%`];
  if (allow > 0) parts.push(`allow ${allow}`);
  if (deny > 0) parts.push(`deny ${deny}`);
  return `Rollout: ${parts.join(" · ")}`;
}

function splitIds(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function RolloutPanel({
  row,
  busy,
  onSave,
  onCancel,
}: {
  row: BuilderTemplateRow;
  busy: boolean;
  onSave: (input: SetTemplateRolloutInput) => void;
  onCancel: () => void;
}) {
  const [pct, setPct] = useState<number>(row.rollout_percentage ?? 100);
  const [allow, setAllow] = useState<string>(
    (row.tenant_allowlist ?? []).join(", "),
  );
  const [deny, setDeny] = useState<string>(
    (row.tenant_denylist ?? []).join(", "),
  );

  return (
    <div
      style={{
        marginTop: 12,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: 14,
        background: T.card,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
        Staged rollout: a published template shows on a tenant&apos;s
        &quot;+&quot; gallery only if the rule admits it. Allowlisted tenants
        always see it; denylisted never do; everyone else is admitted when a
        deterministic bucket of their tenant id falls under the percentage.
      </div>

      <Field label={`Rollout percentage — ${pct}%`}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={(e) =>
              setPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))
            }
            style={{ ...input, width: 70 }}
          />
        </div>
      </Field>

      <Field label="Allowlist tenant ids (comma / space separated)">
        <textarea
          style={mono}
          value={allow}
          onChange={(e) => setAllow(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </Field>
      <Field label="Denylist tenant ids (comma / space separated)">
        <textarea
          style={mono}
          value={deny}
          onChange={(e) => setDeny(e.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
      </Field>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} style={ghost} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSave({
              rollout_percentage: pct,
              tenant_allowlist: splitIds(allow),
              tenant_denylist: splitIds(deny),
            })
          }
          style={{ ...primary, opacity: busy ? 0.5 : 1 }}
        >
          Save rollout
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: T.inkMuted,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: 8,
  border: `1px solid ${T.border}`,
  background: T.cardSoft,
  color: T.ink,
  fontSize: 12.5,
  outline: "none",
};

const mono: React.CSSProperties = {
  ...input,
  minHeight: 44,
  resize: "vertical",
  fontFamily: "ui-monospace, monospace",
};

const ghost: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  border: `1px solid ${T.border}`,
  background: "transparent",
  color: T.ink,
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};

const primary: React.CSSProperties = {
  padding: "6px 13px",
  borderRadius: 8,
  border: "none",
  background: T.accent,
  color: "#0F0F11",
  fontSize: 11.5,
  fontWeight: 700,
  cursor: "pointer",
};
