"use server";

import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";

// `kind` is the table's own enum (`percent` | `fixed`, CHECK-constrained);
// `value` is 1..100 for a percent and INTEGER CENTS for a fixed amount, which
// then needs its currency (the table's `promo_fixed_currency` CHECK).
const createSchema = z
  .object({
    code: z.string().trim().min(2).max(40),
    kind: z.enum(["percent", "fixed"]),
    value: z.number().int().positive(),
    currency: z.string().trim().length(3).optional(),
    label: z.string().trim().max(80).optional(),
  })
  .refine((v) => v.kind !== "percent" || v.value <= 100, { message: "percent_range" })
  .refine((v) => v.kind !== "fixed" || Boolean(v.currency), { message: "fixed_currency" });

export async function createTenantPromo(input: z.infer<typeof createSchema>) {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability("manage_billing", guard.tenantId);
  if (!allowed) return { ok: false as const, error: "not_allowed" };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "invalid" };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "unavailable" };

  const { error } = await admin.from("tenant_promo_codes").insert({
    tenant_id: guard.tenantId,
    code: parsed.data.code,
    kind: parsed.data.kind,
    value: parsed.data.value,
    currency: parsed.data.kind === "fixed" ? parsed.data.currency!.toUpperCase() : null,
    label: parsed.data.label ?? null,
    is_active: true,
    per_customer_limit: 1,
  });
  if (error) {
    logServerError("discounts.create", error);
    return { ok: false as const, error: "unavailable" };
  }
  return { ok: true as const };
}

export async function setTenantPromoActive(id: string, isActive: boolean) {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, error: guard.error };
  const allowed = await userHasCapability("manage_billing", guard.tenantId);
  if (!allowed) return { ok: false as const, error: "not_allowed" };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false as const, error: "invalid" };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, error: "unavailable" };
  const { error } = await admin
    .from("tenant_promo_codes")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("tenant_id", guard.tenantId);
  if (error) {
    logServerError("discounts.toggle", error);
    return { ok: false as const, error: "unavailable" };
  }
  return { ok: true as const };
}
