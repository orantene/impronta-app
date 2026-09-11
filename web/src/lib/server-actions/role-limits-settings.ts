"use server";

/**
 * Settings › Roles & limits › Manual discount and refund limits (W22 /
 * W56, Package 2's `role_limits`).
 *
 * The engine consults `role_limits (tenant_id, role, action, limit_cents)`
 * on discounts and refunds above the limit (`assertRoleLimit`) and has no
 * writer of its own for the row, so this module is the settings writer:
 * one upsert on the unique `(tenant_id, role, action)`, a null to clear.
 * Owner or admin only (`manage_memberships`, the same capability that sets
 * who holds a role). The approval inbox beside it reads
 * `approval_requests`; deciding one is the engine's `decideApprovalAction`.
 */

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { requesterNames } from "@/lib/approvals/requester-names";

export type RoleLimitAction = "discount" | "refund";
export type RoleLimitRole = "viewer" | "editor" | "manager" | "admin" | "owner";

export type RoleLimitRow = { role: RoleLimitRole; action: RoleLimitAction; limitCents: number };

export type ApprovalRequestRow = {
  id: string;
  kind: RoleLimitAction;
  subjectId: string;
  requestedBy: string;
  requestedByName: string | null;
  reason: string | null;
  createdAt: string;
  decision: "approved" | "denied" | null;
  decidedAt: string | null;
};

type Fail = { ok: false; reason: "not_allowed" | "invalid" | "unavailable" };

const ROLES: readonly RoleLimitRole[] = ["viewer", "editor", "manager", "admin", "owner"];
const ACTIONS: readonly RoleLimitAction[] = ["discount", "refund"];

async function guard(write: boolean) {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false as const, reason: "not_allowed" as const };
  if (write) {
    const allowed = await userHasCapability("manage_memberships", staff.tenantId);
    if (!allowed) return { ok: false as const, reason: "not_allowed" as const };
  }
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: staff.tenantId, admin };
}

function isRole(x: string): x is RoleLimitRole {
  return (ROLES as readonly string[]).includes(x);
}
function isAction(x: string): x is RoleLimitAction {
  return (ACTIONS as readonly string[]).includes(x);
}

export async function loadRoleLimitsAction(): Promise<{ ok: true; limits: RoleLimitRow[] } | Fail> {
  const g = await guard(false);
  if (!g.ok) return g;
  const { data, error } = await tenantScopedQuery(g.admin, "role_limits", g.tenantId).select("role, action, limit_cents");
  if (error) {
    logServerError("settings.loadRoleLimits", error);
    return { ok: false, reason: "unavailable" };
  }
  const limits: RoleLimitRow[] = [];
  for (const row of (data ?? []) as Array<{ role: string; action: string; limit_cents: number }>) {
    if (isRole(row.role) && isAction(row.action)) limits.push({ role: row.role, action: row.action, limitCents: Number(row.limit_cents) });
  }
  return { ok: true, limits };
}

export async function writeRoleLimitAction(input: {
  role: RoleLimitRole;
  action: RoleLimitAction;
  limitCents: number | null;
}): Promise<{ ok: true } | Fail> {
  const g = await guard(true);
  if (!g.ok) return g;
  const parsed = z
    .object({
      role: z.enum(["viewer", "editor", "manager", "admin", "owner"]),
      action: z.enum(["discount", "refund"]),
      limitCents: z.number().int().min(0).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { role, action, limitCents } = parsed.data;
  const scoped = tenantScopedQuery(g.admin, "role_limits", g.tenantId);
  const query =
    limitCents === null
      ? scoped.delete().eq("role", role).eq("action", action)
      : scoped.upsert({ role, action, limit_cents: limitCents }, { onConflict: "tenant_id, role, action" });
  const { error } = await query;
  if (error) {
    logServerError("settings.writeRoleLimit", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

export async function loadApprovalRequestsAction(): Promise<{ ok: true; requests: ApprovalRequestRow[] } | Fail> {
  const g = await guard(false);
  if (!g.ok) return g;
  const { data, error } = await tenantScopedQuery(g.admin, "approval_requests", g.tenantId)
    .select("id, kind, subject_id, requested_by, reason, created_at, decision, decided_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    logServerError("settings.loadApprovalRequests", error);
    return { ok: false, reason: "unavailable" };
  }
  const rows = (data ?? []) as Array<{
    id: string;
    kind: string;
    subject_id: string;
    requested_by: string;
    reason: string | null;
    created_at: string;
    decision: "approved" | "denied" | null;
    decided_at: string | null;
  }>;
  const names = await requesterNames(g.admin, [...new Set(rows.map((r) => r.requested_by))]);
  const requests: ApprovalRequestRow[] = [];
  for (const r of rows) {
    if (!isAction(r.kind)) continue;
    requests.push({
      id: r.id,
      kind: r.kind,
      subjectId: r.subject_id,
      requestedBy: r.requested_by,
      requestedByName: names.get(r.requested_by) ?? null,
      reason: r.reason,
      createdAt: r.created_at,
      decision: r.decision,
      decidedAt: r.decided_at,
    });
  }
  return { ok: true, requests };
}
