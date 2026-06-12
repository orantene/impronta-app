// ============================================================================
// field-value-text-i18n-adapter.ts — DEAD field-value i18n translation domain.
//
// T3.2 — this translation-center domain ("Translatable profile field values")
// was built around a `field_values.value_i18n` JSONB column that NEVER existed
// in the schema: every read of it errored (42703) and fell back to a column-less
// LEGACY select, so the domain has only ever surfaced ZERO usable translation
// units. It also enumerated translatable fields from the legacy System A
// `field_definitions` registry. With System A (`field_values` +
// `field_definitions`) retired, the adapter is neutralized to surface no units
// (rather than read the now-removed legacy stores). The registry entry is kept so
// the nav tab/domain id resolve, but `aggregate` returns an empty count and
// `listUnits` returns no rows. Re-enabling a real per-field i18n workflow is a
// future feature that must add a `value_i18n` column to System B + enumerate
// fields from `profile_field_definitions` first (see read-source-translation-i18n.ts).
// ============================================================================

import type { TranslationCenterAdapter, AdapterContext } from "@/lib/translation-center/adapters/adapter-types";
import type {
  DomainAggregateDTO,
  ListUnitsParams,
  ListUnitsResult,
} from "@/lib/translation-center/types";

function empty(domain: AdapterContext["domain"]): DomainAggregateDTO {
  return {
    domainId: domain.id,
    title: domain.title,
    navTabKey: domain.navTabKey,
    contentClass: domain.contentClass,
    coverageWeight: domain.coverageWeight,
    counts: {
      missing: 0,
      complete: 0,
      needs_attention: 0,
      language_issue: 0,
      applicableRequired: 0,
      filledRequired: 0,
    },
  };
}

export const fieldValueTextI18nAdapter: TranslationCenterAdapter = {
  adapterId: "fieldValueTextI18n",

  // Dead domain — no field-value i18n store exists (see file header). Report an
  // empty coverage aggregate without reading any retired System-A table.
  async aggregate(ctx: AdapterContext): Promise<DomainAggregateDTO> {
    return empty(ctx.domain);
  },

  // Dead domain — surface no translation units.
  async listUnits(_ctx: AdapterContext, _params: ListUnitsParams): Promise<ListUnitsResult> {
    return { units: [], hasMore: false, loadError: null };
  },
};
