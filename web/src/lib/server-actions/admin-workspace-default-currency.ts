"use server";

/**
 * admin-workspace-default-currency.ts — load + update of
 * `agencies.default_currency` (PR-E foundation · decision-log L49).
 *
 * Display-only ISO-4217 code that decides which currency tab is selected
 * first on the agency Business Financials surface when multiple
 * currencies show up. Lives in its own column (`agencies.default_currency
 * TEXT NOT NULL DEFAULT 'EUR'`) rather than `settings` JSONB because
 * `loadAgencyFinancialsByCurrency` reads it on every snapshot fetch — a
 * dedicated column is cheaper and the migration was already shipped.
 *
 * Capability gate: `manage_agency_settings` (registry display name
 * "Manage workspace settings"). The DB write uses the service-role
 * client because the agency owner may not have RLS update access to
 * every settings column.
 *
 * Lives in its own file rather than `admin-workspace-settings.ts` so the
 * latter stays under the 800-line budget and so this small surface can
 * be reused by the future Product Pricing dashboard without dragging
 * the rest of the settings module with it.
 *
 * Eslint note: the two `.from("agencies")` calls below trip
 * `ratchet/no-untenanted-from` because `agencies` IS the tenants table —
 * its `id` IS the tenant_id, so `tenantScopedQuery(...)` doesn't apply
 * (the helper filters on a `tenant_id` column that doesn't exist here).
 * The 2 calls are tracked in `eslint-suppressions.json` with a comment
 * explaining the special case.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { AccessDeniedError, requireCapability } from "@/lib/access/has-capability";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  DEFAULT_CURRENCY_FALLBACK,
  DEFAULT_CURRENCY_OPTIONS,
  normalizeDefaultCurrency,
  resolveDefaultCurrencyForUI,
  type DefaultCurrencyCode,
} from "@/lib/billing/currencies";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { scheduleWorkspaceAudit } from "@/lib/audit/workspace-audit";

const defaultCurrencySchema = z
  .object({
    default_currency: z.enum(DEFAULT_CURRENCY_OPTIONS),
  })
  .strict();

export type UpdateAgencyDefaultCurrencyInput = z.infer<typeof defaultCurrencySchema>;
export type UpdateAgencyDefaultCurrencyResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateAgencyDefaultCurrency(
  input: UpdateAgencyDefaultCurrencyInput,
): Promise<UpdateAgencyDefaultCurrencyResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId, tenantSlug } = auth;

  // Normalize FIRST so a lowercase / padded value still reaches the
  // capability check and DB write in canonical form.
  const normalized = normalizeDefaultCurrency(input.default_currency);
  if (!normalized) {
    return { ok: false, error: "Unsupported currency." };
  }
  const parsed = defaultCurrencySchema.safeParse({ default_currency: normalized });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid currency payload.",
    };
  }

  try {
    await requireCapability("manage_agency_settings", tenantId);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return { ok: false, error: "You don't have permission to change this." };
    }
    throw err;
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-workspace-default-currency.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // `agencies` IS the tenants table — `id = tenantId` IS the tenant filter.
  // No `tenantScopedQuery` helper applies here.
  const { error } = await admin
    .from("agencies")
    .update({
      default_currency: parsed.data.default_currency,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenantId);

  if (error) {
    logServerError("admin-workspace-default-currency.update", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  scheduleWorkspaceAudit({
    tenantId,
    category: "settings",
    action: "settings.currency.updated",
    summary: `Changed default currency to ${parsed.data.default_currency}`,
    targetType: "agency",
    targetId: tenantId,
    metadata: { currency: parsed.data.default_currency },
  });

  revalidatePath(`/${tenantSlug}`, "layout");
  return { ok: true };
}

export type LoadAgencyDefaultCurrencyResult =
  | { ok: true; data: { defaultCurrency: DefaultCurrencyCode } }
  | { ok: false; error: string };

export async function loadAgencyDefaultCurrency(): Promise<LoadAgencyDefaultCurrencyResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  // `agencies` IS the tenants table — see note above.
  const { data: agency, error } = await supabase
    .from("agencies")
    .select("default_currency")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    logServerError("admin-workspace-default-currency.load", error);
    return { ok: false, error: "Could not load default currency." };
  }

  return {
    ok: true,
    data: {
      defaultCurrency: resolveDefaultCurrencyForUI(
        (agency as { default_currency?: string } | null)?.default_currency
          ?? DEFAULT_CURRENCY_FALLBACK,
      ),
    },
  };
}
