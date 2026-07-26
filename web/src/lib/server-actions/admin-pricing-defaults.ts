"use server";

/**
 * admin-pricing-defaults.ts — load + update of a tenant's starting-price
 * defaults (`agencies.settings.directoryPricingDefaults`).
 *
 * These are the numbers a directory card falls back to when a talent has not
 * priced themselves. They are published PUBLICLY on cards, so the write path
 * is capability-gated (`manage_agency_settings`) exactly like the other
 * money-adjacent workspace settings.
 *
 * The talent's own price always wins, and a talent who deliberately published
 * "quote on request" is never overridden — that rule lives in
 * lib/directory/pricing-defaults-shape.ts (resolveStartingPrice) and is
 * enforced at read time, not here.
 *
 * Eslint note: the `.from("agencies")` calls trip `ratchet/no-untenanted-from`
 * because `agencies` IS the tenants table — its `id` IS the tenant_id, so
 * `tenantScopedQuery(...)` does not apply. Same special case as
 * admin-workspace-default-currency.ts.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { AccessDeniedError, requireCapability } from "@/lib/access/has-capability";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  EMPTY_PRICING_DEFAULTS,
  MAX_DEFAULT_PRICE_CENTS,
  MIN_DEFAULT_PRICE_CENTS,
  parsePricingDefaults,
  pricingDefaultsToSettings,
  type TenantPricingDefaults,
} from "@/lib/directory/pricing-defaults-shape";
import type {
  LoadPricingDefaultsResult,
  TalentTypeOption,
  UpdatePricingDefaultsResult,
} from "@/lib/directory/pricing-defaults-shape";
import { invalidateTenantPricingDefaults } from "@/lib/directory/pricing-defaults";
import type { SupabaseClient } from "@supabase/supabase-js";

const amount = z
  .number()
  .int()
  .min(MIN_DEFAULT_PRICE_CENTS)
  .max(MAX_DEFAULT_PRICE_CENTS);

const schema = z
  .object({
    enabled: z.boolean(),
    currency: z.string().trim().length(3),
    globalFromCents: amount.nullable(),
    byTypeSlug: z.record(z.string().trim().min(1), amount),
  })
  .strict();

export async function updateTenantPricingDefaults(
  input: TenantPricingDefaults,
): Promise<UpdatePricingDefaultsResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId, tenantSlug } = auth;

  const parsed = schema.safeParse({
    ...input,
    currency: input.currency?.toUpperCase(),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid pricing defaults.",
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
    logServerError("admin-pricing-defaults.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Read-modify-write so sibling settings namespaces survive.
  const { data: agency, error: readErr } = await admin
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (readErr) {
    logServerError("admin-pricing-defaults.read", readErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const nextSettings = pricingDefaultsToSettings(
    (agency as { settings: unknown } | null)?.settings,
    parsed.data,
  );

  const { error } = await admin
    .from("agencies")
    .update({ settings: nextSettings, updated_at: new Date().toISOString() })
    .eq("id", tenantId);

  if (error) {
    logServerError("admin-pricing-defaults.update", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  invalidateTenantPricingDefaults(tenantId);
  revalidatePath(`/${tenantSlug}`, "layout");
  return { ok: true };
}

export async function loadTenantPricingDefaultsAction(): Promise<LoadPricingDefaultsResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data, error } = await supabase
    .from("agencies")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    logServerError("admin-pricing-defaults.load", error);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  return {
    ok: true,
    data: data
      ? parsePricingDefaults((data as { settings: unknown }).settings)
      : EMPTY_PRICING_DEFAULTS,
    talentTypes: await loadTalentTypeOptions(supabase, tenantId),
  };
}

/**
 * The talent types actually present on THIS tenant's roster, with a headcount,
 * so the operator prices the categories they really have rather than picking
 * from the full platform taxonomy.
 */
async function loadTalentTypeOptions(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TalentTypeOption[]> {
  const { data, error } = await tenantScopedQuery(
    supabase,
    "talent_profile_taxonomy",
    tenantId,
  )
    .select("talent_profile_id, is_primary, taxonomy_terms ( slug, kind, name_i18n )")
    .eq("is_primary", true);

  if (error || !data) return [];

  const counts = new Map<string, { label: string; n: number }>();
  for (const row of data as Array<{
    taxonomy_terms:
      | { slug: string; kind: string; name_i18n: Record<string, string | null> | null }
      | Array<{ slug: string; kind: string; name_i18n: Record<string, string | null> | null }>
      | null;
  }>) {
    const terms = row.taxonomy_terms
      ? Array.isArray(row.taxonomy_terms)
        ? row.taxonomy_terms
        : [row.taxonomy_terms]
      : [];
    for (const term of terms) {
      if (!term?.slug || term.kind !== "talent_type") continue;
      const prev = counts.get(term.slug);
      counts.set(term.slug, {
        label: term.name_i18n?.en ?? term.slug,
        n: (prev?.n ?? 0) + 1,
      });
    }
  }

  return [...counts.entries()]
    .map(([slug, v]) => ({ slug, label: v.label, talentCount: v.n }))
    .sort((a, b) => b.talentCount - a.talentCount || a.label.localeCompare(b.label));
}
