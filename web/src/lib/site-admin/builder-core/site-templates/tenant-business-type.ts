/**
 * tenant-business-type.ts — which business type a tenant IS, from what the
 * workspace already records. One resolver so the Media stock folder, the
 * composer and the generator agree.
 *
 * Order: `agencies.settings.business_type_id` (set by the industry settings
 * card, `server-actions/industry-settings.ts`) → the family of
 * `settings.industry_preset` (set at signup, `workspace-signup.server.ts:279`)
 * → `custom`. A brief's `work.industry` string is resolved separately by the
 * composer through `searchBusinessTypes`, which can WRITE `business_type_id`;
 * this module never writes.
 */

import {
  BUSINESS_TYPES,
  FAMILY_DEFAULT_PRESET,
  type BusinessFamilyId,
} from "@/lib/words/business-types";
import type { IndustryPresetId } from "@/lib/words/presets";

export interface ResolvedBusinessType {
  typeId: string;
  family: BusinessFamilyId;
  /** Where the answer came from, for the handoff and the admin strip. */
  source: "business_type_id" | "industry_preset" | "default";
}

const TYPE_BY_ID = new Map(BUSINESS_TYPES.map((t) => [t.id, t] as const));

/** First family whose default preset is this preset (the reverse of `FAMILY_DEFAULT_PRESET`). */
function familyForPreset(preset: string): BusinessFamilyId | null {
  for (const [family, p] of Object.entries(FAMILY_DEFAULT_PRESET) as Array<[BusinessFamilyId, IndustryPresetId]>) {
    if (p === preset) return family;
  }
  // Presets with no family default (bar_club, beach_club, clinic, …): take the
  // first type that names the preset.
  const hit = BUSINESS_TYPES.find((t) => t.preset === preset);
  return hit?.family ?? null;
}

export function resolveTenantBusinessType(rawSettings: unknown): ResolvedBusinessType {
  const settings = (rawSettings && typeof rawSettings === "object" ? rawSettings : {}) as Record<string, unknown>;
  const typeId = typeof settings.business_type_id === "string" ? settings.business_type_id : null;
  if (typeId && TYPE_BY_ID.has(typeId)) {
    return { typeId, family: TYPE_BY_ID.get(typeId)!.family, source: "business_type_id" };
  }
  const preset = typeof settings.industry_preset === "string" ? settings.industry_preset : null;
  if (preset) {
    const family = familyForPreset(preset);
    if (family) {
      const first = BUSINESS_TYPES.find((t) => t.family === family && t.preset === preset) ?? BUSINESS_TYPES.find((t) => t.family === family);
      return { typeId: first?.id ?? "custom", family, source: "industry_preset" };
    }
  }
  return { typeId: "custom", family: "custom", source: "default" };
}
