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
  const { data, error } = await g.admin.from("role_limits").select("role, action, limit_cents").eq("tenant_id", g.tenantId);
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
  const query =
    limitCents === null
      ? g.admin.from("role_limits").delete().eq("tenant_id", g.tenantId).eq("role", role).eq("action", action)
      : g.admin
          .from("role_limits")
          .upsert({ tenant_id: g.tenantId, role, action, limit_cents: limitCents }, { onConflict: "tenant_id, role, action" });
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
  const { data, error } = await g.admin
    .from("approval_requests")
    .select("id, kind, subject_id, requested_by, reason, created_at, decision, decided_at")
    .eq("tenant_id", g.tenantId)
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
  const requesterIds = [...new Set(rows.map((r) => r.requested_by))];
  const names = new Map<string, string>();
  if (requesterIds.length > 0) {
    const { data: profiles } = await g.admin.from("profiles").select("id, display_name").in("id", requesterIds);
    for (const p of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (p.display_name) names.set(p.id, p.display_name);
    }
  }
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
