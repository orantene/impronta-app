"use server";

/**
 * TUL-1722: the OWNER sets what managers and admins may refund or discount
 * without asking. Unset is closed (TUL-1516), so without this step every
 * manager refund becomes an approval request. Owner only: the capability is
 * `transfer_ownership`, which no other role holds, and the tenant is resolved
 * on the server from the signed-in workspace, never from the input.
 */

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { planStaffLimitWrites } from "@/lib/pos/staff-limit-plan";

const cell = z.number().int().min(0).max(100_000_000_00).nullable();
const roleCells = z.object({ refund: cell, discount: cell }).strict();
const inputSchema = z.object({ manager: roleCells, admin: roleCells }).strict();

export async function saveStaffLimitsAction(
  input: z.input<typeof inputSchema>,
): Promise<{ ok: true } | { ok: false; reason: "not_allowed" | "invalid" | "unavailable" }> {
  await requireNotImpersonating();
  const staff = await requireWorkspaceStaffAction({ capability: "transfer_ownership" });
  if (!staff.ok) return { ok: false, reason: "not_allowed" };
  if (!(await userHasCapability("transfer_ownership", staff.tenantId))) return { ok: false, reason: "not_allowed" };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  for (const w of planStaffLimitWrites(parsed.data)) {
    const scoped = tenantScopedQuery(admin, "role_limits", staff.tenantId);
    const { error } =
      w.limitCents === null
        ? await scoped.delete().eq("role", w.role).eq("action", w.action)
        : await scoped.upsert(
            { role: w.role, action: w.action, limit_cents: w.limitCents },
            { onConflict: "tenant_id, role, action" },
          );
    if (error) {
      logServerError("settings.saveStaffLimits", error);
      return { ok: false, reason: "unavailable" };
    }
  }
  return { ok: true };
}
