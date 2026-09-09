/**
 * Business-type registry reconciliation — report the real count, never claim 120
 * without measuring.
 */

import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_CATALOG_TARGET,
  catalogBusinessTypes,
  businessTypeById,
} from "@/lib/words/business-types";
import { INDUSTRY_PRESET_IDS } from "@/lib/words/presets";
import { DESTINATION_IDS, DESTINATION_REGISTRY } from "@/lib/master/destinations";

export type RegistryReport = {
  /** catalogBusinessTypes().length — excludes the custom fallback. */
  catalogCount: number;
  /** Target constant in business-types.ts (documentation only). */
  catalogTarget: number;
  /** Whether the catalog meets the documented target. */
  meetsTarget: boolean;
  /** Never claim 120 complete unless this is true. */
  mayClaimComplete120: boolean;
  industryPresetCount: number;
  destinationCount: number;
  missingDestinationPaths: readonly string[];
  unknownPresetIds: readonly string[];
};

export function reconcileBusinessRegistry(): RegistryReport {
  const catalog = catalogBusinessTypes();
  const presets = new Set<string>(INDUSTRY_PRESET_IDS);
  const unknownPresetIds: string[] = [];
  for (const row of BUSINESS_TYPES) {
    if (!presets.has(row.preset)) unknownPresetIds.push(`${row.id}:${row.preset}`);
  }
  const missingDestinationPaths = DESTINATION_IDS.filter(
    (id) => DESTINATION_REGISTRY[id].built && DESTINATION_REGISTRY[id].path == null,
  );
  const catalogCount = catalog.length;
  const meetsTarget = catalogCount >= BUSINESS_TYPE_CATALOG_TARGET;
  return {
    catalogCount,
    catalogTarget: BUSINESS_TYPE_CATALOG_TARGET,
    meetsTarget,
    mayClaimComplete120: meetsTarget && catalogCount >= 120,
    industryPresetCount: INDUSTRY_PRESET_IDS.length,
    destinationCount: DESTINATION_IDS.length,
    missingDestinationPaths,
    unknownPresetIds,
  };
}

export function assertKnownBusinessType(id: string): boolean {
  return businessTypeById(id) != null;
}
