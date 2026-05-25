export type TenantCatalogScopeField = {
  id: string;
  tier: string | null;
};

export type TenantCatalogScopeRecommendation = {
  field_definition_id: string;
  taxonomy_term_id: string;
};

export type TenantCatalogScopeTerm = {
  id: string;
  parent_id: string | null;
  is_active?: boolean | null;
};

export type TenantCatalogScopeSetting = {
  taxonomy_term_id: string;
  is_enabled: boolean | null;
};

function buildEnabledTermIds(
  terms: readonly TenantCatalogScopeTerm[],
  settings: readonly TenantCatalogScopeSetting[],
): Set<string> {
  const termById = new Map(terms.map((term) => [term.id, term] as const));
  const settingByTermId = new Map(
    settings.map((setting) => [setting.taxonomy_term_id, setting] as const),
  );
  const memo = new Map<string, boolean>();

  const isEnabled = (termId: string, seen = new Set<string>()): boolean => {
    if (memo.has(termId)) return memo.get(termId)!;
    if (seen.has(termId)) return false;
    seen.add(termId);

    const term = termById.get(termId);
    if (!term || term.is_active === false) {
      memo.set(termId, false);
      return false;
    }

    const localEnabled = settingByTermId.get(termId)?.is_enabled !== false;
    const parentEnabled = term.parent_id ? isEnabled(term.parent_id, seen) : true;
    const enabled = localEnabled && parentEnabled;
    memo.set(termId, enabled);
    return enabled;
  };

  return new Set(terms.filter((term) => isEnabled(term.id)).map((term) => term.id));
}

export function filterTenantCatalogFieldsByEnabledTaxonomy<
  Field extends TenantCatalogScopeField,
>(
  fields: readonly Field[],
  recommendations: readonly TenantCatalogScopeRecommendation[],
  terms: readonly TenantCatalogScopeTerm[],
  settings: readonly TenantCatalogScopeSetting[],
): Field[] {
  const enabledTermIds = buildEnabledTermIds(terms, settings);
  const enabledTypeSpecificFieldIds = new Set<string>();

  for (const recommendation of recommendations) {
    if (enabledTermIds.has(recommendation.taxonomy_term_id)) {
      enabledTypeSpecificFieldIds.add(recommendation.field_definition_id);
    }
  }

  return fields.filter(
    (field) =>
      field.tier !== "type-specific" ||
      enabledTypeSpecificFieldIds.has(field.id),
  );
}
