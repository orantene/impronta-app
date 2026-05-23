/**
 * Shared chips for the Users surface — type (identity) and membership role.
 * Server-safe (no hooks, no "use client").
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

export function TypeChip({ type }: { type: string }) {
  const m = TYPE_META[type] ?? TYPE_META.client;
  return (
    <Chip bg={m.bg} color={m.color}>
      {m.label}
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

export function MembershipRoleChip({ role }: { role: string }) {
  return <Chip color={MEMBERSHIP_ROLE_COLORS[role] ?? HQ.inkMuted}>{role}</Chip>;
}
