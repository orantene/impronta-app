import type { SupabaseClient } from "@supabase/supabase-js";

export type TenantTaxonomyPlan = "free" | "studio" | "agency" | "network";

export const TENANT_TAXONOMY_PARENT_LIMITS: Record<TenantTaxonomyPlan, number> = {
  free: 3,
  studio: 8,
  agency: 999,
  network: 999,
};

export function normalizeTenantTaxonomyPlan(plan: string | null | undefined): TenantTaxonomyPlan {
  return plan === "studio" || plan === "agency" || plan === "network" ? plan : "free";
}

export function canEnableParentCategoryForPlan(input: {
  plan: string | null | undefined;
  enabledParentCount: number;
  isAlreadyEnabled: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (input.isAlreadyEnabled) return { ok: true };
  const plan = normalizeTenantTaxonomyPlan(input.plan);
  const limit = TENANT_TAXONOMY_PARENT_LIMITS[plan];
  if (input.enabledParentCount >= limit) {
    const label = plan.charAt(0).toUpperCase() + plan.slice(1);
    return { ok: false, error: `${label} workspaces can enable ${limit} talent type groups.` };
  }
  return { ok: true };
}

export async function assertCanEnableTenantParentCategory(params: {
  supabase: SupabaseClient;
  tenantId: string;
  taxonomyTermId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, tenantId, taxonomyTermId } = params;
  const { data: term, error: termError } = await supabase
    .from("taxonomy_terms")
    .select("id, term_type")
    .eq("id", taxonomyTermId)
    .maybeSingle();
  if (termError || term?.term_type !== "parent_category") return { ok: true };

  const [{ data: agency }, { data: current }, { data: parents }] = await Promise.all([
    supabase.from("agencies").select("plan_tier").eq("id", tenantId).maybeSingle(),
    supabase
      .from("agency_taxonomy_settings")
      .select("is_enabled")
      .eq("tenant_id", tenantId)
      .eq("taxonomy_term_id", taxonomyTermId)
      .maybeSingle(),
    supabase
      .from("taxonomy_terms")
      .select("id")
      .eq("term_type", "parent_category")
      .eq("is_active", true)
      .is("archived_at", null),
  ]);

  const parentIds = (parents ?? []).map((row) => row.id);
  if (parentIds.length === 0) return { ok: true };

  const { data: settings } = await supabase
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id, is_enabled")
    .eq("tenant_id", tenantId)
    .in("taxonomy_term_id", parentIds);

  const settingsByTerm = new Map((settings ?? []).map((row) => [row.taxonomy_term_id, row.is_enabled] as const));
  const enabledParentCount = parentIds.filter((id) => settingsByTerm.get(id) !== false).length;
  return canEnableParentCategoryForPlan({
    plan: agency?.plan_tier,
    enabledParentCount,
    isAlreadyEnabled: current?.is_enabled !== false,
  });
}
