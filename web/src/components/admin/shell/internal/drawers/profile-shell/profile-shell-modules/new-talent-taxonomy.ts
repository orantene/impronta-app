import type {
  LiveTaxonomyParent,
  TaxonomyNode,
  TaxonomyParent,
} from "../../drawer-shared";

type Plan = "free" | "studio" | "agency" | "network";

const PLAN_RANK: Record<Plan, number> = {
  free: 0,
  studio: 1,
  agency: 2,
  network: 3,
};

type TenantFilterState = {
  primaryParents: Set<string>;
  secondaryParents: Set<string>;
  enabledGroups: Set<string>;
  order: Map<string, number>;
};

function buildTenantFilterState(tree: TaxonomyNode[] | null): TenantFilterState | null {
  if (!tree) return null;
  const primaryParents = new Set<string>();
  const secondaryParents = new Set<string>();
  const enabledGroups = new Set<string>();
  const order = new Map<string, number>();

  for (const parent of tree) {
    order.set(parent.id, parent.display_order);
    order.set(parent.slug, parent.display_order);
    if (parent.is_enabled && parent.allow_as_primary) {
      primaryParents.add(parent.id);
      primaryParents.add(parent.slug);
    }
    if (parent.is_enabled && parent.allow_as_secondary) {
      secondaryParents.add(parent.id);
      secondaryParents.add(parent.slug);
    }
    for (const child of parent.children) {
      if (!child.is_enabled) continue;
      enabledGroups.add(child.id);
      enabledGroups.add(child.slug);
    }
  }

  return { primaryParents, secondaryParents, enabledGroups, order };
}

function mapLiveParents(input: {
  list: LiveTaxonomyParent[];
  parentKeys: Set<string> | null;
  fallbackAllowedParentIds: Set<string>;
  tenantFilters: TenantFilterState | null;
  currentPlan: Plan;
}): TaxonomyParent[] {
  const { list, parentKeys, fallbackAllowedParentIds, tenantFilters, currentPlan } = input;
  return list
    .filter(lp => PLAN_RANK[lp.display.minPlan] <= PLAN_RANK[currentPlan])
    .filter(lp => {
      if (parentKeys) {
        return parentKeys.has(lp.raw.id)
          || parentKeys.has(lp.raw.slug)
          || parentKeys.has(lp.display.id);
      }
      return fallbackAllowedParentIds.has(lp.raw.slug)
        || fallbackAllowedParentIds.has(lp.display.id);
    })
    .map(lp => {
      const children = tenantFilters
        ? lp.talentTypes
          .filter(t => !t.parentId || t.parentId === lp.raw.id || tenantFilters.enabledGroups.has(t.parentId))
          .map(t => ({ id: t.slug, label: t.label }))
        : lp.display.children;
      return { ...lp.display, children };
    })
    .filter(parent => parent.children.length > 0)
    .sort((a, b) => {
      if (!tenantFilters) return 0;
      return (tenantFilters.order.get(a.id) ?? 1000) - (tenantFilters.order.get(b.id) ?? 1000);
    });
}

export function buildNewTalentPickerTaxonomy(input: {
  visibleLiveParents: LiveTaxonomyParent[];
  restLiveParents: LiveTaxonomyParent[];
  tenantTree: TaxonomyNode[] | null;
  fallbackAllowedParentIds: Set<string>;
  currentPlan: Plan;
  showMore: boolean;
}): {
  visibleParents: TaxonomyParent[];
  restParents: TaxonomyParent[];
  allowedParents: TaxonomyParent[];
  allSecondaryParents: TaxonomyParent[];
} {
  const tenantFilters = buildTenantFilterState(input.tenantTree);
  const visibleParents = mapLiveParents({
    list: input.visibleLiveParents,
    parentKeys: tenantFilters?.primaryParents ?? null,
    fallbackAllowedParentIds: input.fallbackAllowedParentIds,
    tenantFilters,
    currentPlan: input.currentPlan,
  });
  const restParents = mapLiveParents({
    list: input.restLiveParents,
    parentKeys: tenantFilters?.primaryParents ?? null,
    fallbackAllowedParentIds: input.fallbackAllowedParentIds,
    tenantFilters,
    currentPlan: input.currentPlan,
  });
  const secondaryKeys = tenantFilters?.secondaryParents ?? tenantFilters?.primaryParents ?? null;
  const secondaryVisibleParents = mapLiveParents({
    list: input.visibleLiveParents,
    parentKeys: secondaryKeys,
    fallbackAllowedParentIds: input.fallbackAllowedParentIds,
    tenantFilters,
    currentPlan: input.currentPlan,
  });
  const secondaryRestParents = mapLiveParents({
    list: input.restLiveParents,
    parentKeys: secondaryKeys,
    fallbackAllowedParentIds: input.fallbackAllowedParentIds,
    tenantFilters,
    currentPlan: input.currentPlan,
  });

  return {
    visibleParents,
    restParents,
    allowedParents: input.showMore ? [...visibleParents, ...restParents] : visibleParents,
    allSecondaryParents: [...secondaryVisibleParents, ...secondaryRestParents],
  };
}
