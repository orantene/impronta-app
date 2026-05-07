"use server";

import { revalidatePath } from "next/cache";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "./currency-options";

export async function setCurrencyPreferenceAction(
  tenantSlug: string,
  currency: string,
): Promise<{ ok: boolean; error?: string }> {
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };

  const canManage = await userHasCapability("manage_billing", scope.tenantId);
  if (!canManage) return { ok: false, error: "Permission denied." };

  // Validate — must be blank (auto) or one of the supported codes
  const validCodes = SUPPORTED_CURRENCIES.map((c) => c.code);
  const normalized = currency.toLowerCase().trim();
  if (!validCodes.includes(normalized as CurrencyCode)) {
    return { ok: false, error: "Unsupported currency." };
  }

  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database unavailable." };

  const { error } = await sb
    .from("agencies")
    .update({ preferred_currency: normalized || null })
    .eq("id", scope.tenantId);

  if (error) return { ok: false, error: "Failed to save currency preference." };

  revalidatePath(`/${tenantSlug}/admin/account`);
  return { ok: true };
}
