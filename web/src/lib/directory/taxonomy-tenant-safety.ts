import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";

export type DirectoryTaxonomySafetyTerm = {
  id: string;
  parent_id: string | null;
};

export type DirectoryTaxonomySafetySetting = {
  taxonomy_term_id: string;
  is_enabled: boolean | null;
  show_in_directory: boolean | null;
};

export function filterTaxonomyTermIdsByTenantDirectorySafety(input: {
  requestedTermIds: readonly string[];
  termsById: ReadonlyMap<string, DirectoryTaxonomySafetyTerm>;
  settingsByTermId: ReadonlyMap<string, DirectoryTaxonomySafetySetting>;
}): string[] {
  const requested = [...new Set(input.requestedTermIds.filter(Boolean))];
  const allowed: string[] = [];

  for (const termId of requested) {
    let current: DirectoryTaxonomySafetyTerm | undefined = input.termsById.get(termId);
    let depth = 0;
    let visible = !!current;
    while (current && depth < 8) {
      const setting = input.settingsByTermId.get(current.id);
      if (setting?.is_enabled === false || setting?.show_in_directory === false) {
        visible = false;
        break;
      }
      current = current.parent_id ? input.termsById.get(current.parent_id) : undefined;
      depth += 1;
    }
    if (visible) allowed.push(termId);
  }

  return allowed;
}

export async function resolveTenantSafeDirectoryTaxonomyTermIds(
  supabase: SupabaseClient,
  tenantId: string | null,
  requestedTermIds: readonly string[],
): Promise<string[]> {
  const requested = [...new Set(requestedTermIds.filter(Boolean))];
  if (!tenantId || requested.length === 0) return requested;

  const client = createServiceRoleClient() ?? supabase;
  const termsById = new Map<string, DirectoryTaxonomySafetyTerm>();
  let frontier = requested;

  for (let depth = 0; depth < 8 && frontier.length > 0; depth += 1) {
    const { data, error } = await client
      .from("taxonomy_terms")
      .select("id, parent_id")
      .in("id", frontier)
      .is("archived_at", null);
    if (error) return [];

    const next: string[] = [];
    for (const row of (data ?? []) as DirectoryTaxonomySafetyTerm[]) {
      termsById.set(row.id, row);
      if (row.parent_id && !termsById.has(row.parent_id)) {
        next.push(row.parent_id);
      }
    }
    frontier = [...new Set(next)];
  }

  if (requested.some((id) => !termsById.has(id))) return [];

  const { data: settings, error: settingsError } = await client
    .from("agency_taxonomy_settings")
    .select("taxonomy_term_id, is_enabled, show_in_directory")
    .eq("tenant_id", tenantId)
    .in("taxonomy_term_id", [...termsById.keys()]);
  if (settingsError) return [];

  const settingsByTermId = new Map<string, DirectoryTaxonomySafetySetting>();
  for (const row of (settings ?? []) as DirectoryTaxonomySafetySetting[]) {
    settingsByTermId.set(row.taxonomy_term_id, row);
  }

  return filterTaxonomyTermIdsByTenantDirectorySafety({
    requestedTermIds: requested,
    termsById,
    settingsByTermId,
  });
}
