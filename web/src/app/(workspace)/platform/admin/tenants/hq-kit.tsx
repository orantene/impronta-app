/**
 * Tulala HQ — shared design tokens + presentational chips for the platform
 * tenant-management surface.
 *
 * No "use client" and no hooks — these are pure presentational components,
 * safe to render from both server components (the full page) and client
 * components (the table + drawer).
 */

import type { CSSProperties, ReactNode } from "react";

export const HQ = {
  bg: "#0F0F11",
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  cardSofter: "rgba(255,255,255,0.02)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  greenSoft: "rgba(93,211,160,0.12)",
  amber: "#E5B567",
  amberSoft: "rgba(229,181,103,0.12)",
  red: "#F36772",
  redSoft: "rgba(243,103,114,0.12)",
  purple: "#A07AE0",
  blue: "#7AB7E0",
} as const;

export const HQ_F = '"Inter", system-ui, sans-serif';
export const HQ_FD =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';
export const HQ_FM = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';

// ─── Generic chip ─────────────────────────────────────────────────────────────

export function Chip({
  children,
  bg,
  color,
  outline,
  title,
}: {
  children: ReactNode;
  bg?: string;
  color?: string;
  outline?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        background: outline ? "transparent" : bg ?? HQ.cardSoft,
        color: color ?? HQ.inkMuted,
        border: outline ? `1px solid ${HQ.borderSoft}` : "1px solid transparent",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        borderRadius: 999,
        fontFamily: HQ_F,
        whiteSpace: "nowrap",
        lineHeight: 1.5,
      }}
    >
      {children}
    </span>
  );
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  free: { bg: "rgba(245,242,235,0.08)", color: "rgba(245,242,235,0.62)" },
  studio: { bg: "rgba(122,183,224,0.15)", color: HQ.blue },
  agency: { bg: HQ.greenSoft, color: HQ.green },
  network: { bg: "rgba(160,122,224,0.15)", color: HQ.purple },
};

export function PlanChip({ plan, title }: { plan: string; title?: string }) {
  const c = PLAN_COLORS[plan] ?? PLAN_COLORS.free;
  return (
    <Chip bg={c.bg} color={c.color} title={title}>
      {plan}
    </Chip>
  );
}

// ─── Workspace status ──────────────────────────────────────────────────────────

const STATUS_META: Record<string, { color: string; soft: string; label: string }> =
  {
    active: { color: HQ.green, soft: HQ.greenSoft, label: "Active" },
    trial: { color: HQ.amber, soft: HQ.amberSoft, label: "Trial" },
    onboarding: { color: HQ.amber, soft: HQ.amberSoft, label: "Onboarding" },
    draft: { color: HQ.inkDim, soft: HQ.cardSoft, label: "Draft" },
    past_due: { color: HQ.amber, soft: HQ.amberSoft, label: "Past due" },
    restricted: { color: HQ.amber, soft: HQ.amberSoft, label: "Restricted" },
    suspended: { color: HQ.red, soft: HQ.redSoft, label: "Suspended" },
    cancelled: { color: HQ.red, soft: HQ.redSoft, label: "Cancelled" },
    archived: { color: HQ.inkDim, soft: HQ.cardSoft, label: "Archived" },
  };

export function statusMeta(status: string) {
  return (
    STATUS_META[status] ?? {
      color: HQ.inkMuted,
      soft: HQ.cardSoft,
      label: status,
    }
  );
}

export function StatusDot({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: m.color,
          flexShrink: 0,
        }}
      />
      <span style={{ color: HQ.inkMuted, fontSize: 12.5 }}>{m.label}</span>
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <Chip bg={m.soft} color={m.color}>
      {m.label}
    </Chip>
  );
}

// ─── Role ──────────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  owner: HQ.green,
  admin: HQ.purple,
  coordinator: HQ.blue,
  editor: HQ.amber,
  viewer: HQ.inkDim,
};

export function RoleChip({ role }: { role: string }) {
  return <Chip color={ROLE_COLORS[role] ?? HQ.inkMuted}>{role}</Chip>;
}

// ─── Entity type ───────────────────────────────────────────────────────────────

export function EntityChip({ entityType }: { entityType: string }) {
  const isHub = entityType === "hub";
  return (
    <Chip outline color={HQ.inkMuted}>
      {isHub ? "·•· Hub" : "▣ Agency"}
    </Chip>
  );
}

// ─── Card / section shells ─────────────────────────────────────────────────────

export function hqCardStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: HQ.card,
    border: `1px solid ${HQ.borderSoft}`,
    borderRadius: 12,
    fontFamily: HQ_F,
    ...extra,
  };
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10.5,
        color: HQ.inkMuted,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase",
        fontFamily: HQ_F,
      }}
    >
      {children}
    </span>
  );
}

export function MonoId({ value }: { value: string }) {
  return (
    <code style={{ fontFamily: HQ_FM, fontSize: 11, color: HQ.inkMuted }}>
      {value}
    </code>
  );
}
