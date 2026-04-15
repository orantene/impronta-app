import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DomainAggregateDTO,
  ListUnitsParams,
  ListUnitsResult,
  TranslationDomainDefinition,
} from "@/lib/translation-center/types";

export const TC_TABLE_PAGE_SIZE = 80;
export const TC_AGGREGATE_LIST_CAP = 2000;

export type AdapterContext = {
  supabase: SupabaseClient;
  domain: TranslationDomainDefinition;
};

/**
 * Registry adapter: aggregates + list rows. Each listed row carries
 * `TranslationUnitDTO.inlineEdit` from `editor-contract.buildTranslationUnitInlineEdit` so the same
 * metadata can power other admin “quick edit” surfaces later.
 */
export interface TranslationCenterAdapter {
  readonly adapterId: string;
  aggregate(ctx: AdapterContext): Promise<DomainAggregateDTO>;
  listUnits(ctx: AdapterContext, params: ListUnitsParams): Promise<ListUnitsResult>;
}
