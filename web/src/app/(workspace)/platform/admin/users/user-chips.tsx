/**
 * Shared chips for the Users surface — type (identity) and membership role.
 * Server-safe (no hooks, no "use client").
 *
 * These render from both server (page) and client (table + drawer) code, so the
 * chips stay hook-free: a localized consumer resolves a label via the exported
 * *_LABEL_KEY maps and passes it as the `label` prop; callers with no translator
 * fall back to the chip's built-in English text.
 */

import { Chip, HQ } from "../tenants/hq-kit";

const TYPE_META: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  super_admin: { label: "Super-admin", bg: HQ.greenSoft, color: HQ.green },
  staff:       { label: "Staff",       bg: "rgba(160,122,224,0.15)", color: HQ.purple },
  talent:      { label: "Talent",      bg: "rgba(122,183,224,0.15)", color: HQ.blue },
  client:      { label: "Client",      bg: "rgba(245,242,235,0.08)", color: "rgba(245,242,235,0.72)" },
};

// talent reuses the shared role label; the rest are users-scoped identity labels
export const TYPE_LABEL_KEY: Record<string, string> = {
  super_admin: "dashboard.platform.users.type.super_admin",
  staff: "dashboard.platform.users.type.staff",
  talent: "dashboard.platform.role.talent",
  client: "dashboard.platform.users.type.client",
};

export function TypeChip({ type, label }: { type: string; label?: string }) {
  const m = TYPE_META[type] ?? TYPE_META.client;
  return (
    <Chip bg={m.bg} color={m.color}>
      {label ?? m.label}
    </Chip>
  );
}

const MEMBERSHIP_ROLE_COLORS: Record<string, string> = {
  owner: HQ.green,
  admin: HQ.purple,
  manager: HQ.blue,
  coordinator: HQ.blue,
  editor: HQ.amber,
  viewer: HQ.inkDim,
};

// owner/admin/coordinator/editor reuse the shared role labels; manager/viewer
// are users-scoped.
export const MEMBERSHIP_ROLE_LABEL_KEY: Record<string, string> = {
  owner: "dashboard.platform.role.owner",
  admin: "dashboard.platform.role.admin",
  coordinator: "dashboard.platform.role.coordinator",
  editor: "dashboard.platform.role.editor",
  manager: "dashboard.platform.users.membershipRole.manager",
  viewer: "dashboard.platform.users.membershipRole.viewer",
};

export function MembershipRoleChip({ role, label }: { role: string; label?: string }) {
  return <Chip color={MEMBERSHIP_ROLE_COLORS[role] ?? HQ.inkMuted}>{label ?? role}</Chip>;
}
