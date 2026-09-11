/**
 * L56 — four independent layers. Do not collapse them.
 */

import type { IndustryPresetId } from "./presets";
import { FAMILY_DEFAULT_PRESET, type BusinessFamilyId, type BusinessType } from "./business-types";

export type CapabilityKey =
  | "appointments"
  | "events"
  | "reservations"
  | "classes"
  | "preparation"
  | "pos"
  | "menu";

export type StartingView =
  | "today"
  | "tables"
  | "appointments"
  | "admissions"
  | "departures"
  | "inbox";

export type VocabularyNoun = "services" | "menu" | "packages" | "tickets" | "classes";

export type ThemeLayers = {
  type: BusinessType;
  secondaryTypeIds: readonly string[];
  vocabulary: VocabularyNoun;
  capabilities: readonly CapabilityKey[];
  startingView: StartingView;
};

export function resolveVocabulary(input: {
  override?: VocabularyNoun | null;
  typePreset?: VocabularyNoun | null;
  familyPreset?: VocabularyNoun | null;
  canonical: VocabularyNoun;
}): VocabularyNoun {
  return input.override ?? input.typePreset ?? input.familyPreset ?? input.canonical;
}

export function suggestedPresetForFamily(family: BusinessFamilyId): IndustryPresetId {
  return FAMILY_DEFAULT_PRESET[family];
}

/** Roster stays visible when any relationship or capability needs it. */
export function rosterVisible(input: {
  capabilities: readonly CapabilityKey[];
  hasRosterMembers: boolean;
  isSolo: boolean;
}): boolean {
  if (input.hasRosterMembers) return true;
  if (input.capabilities.includes("appointments") && input.hasRosterMembers) return true;
  void input.isSolo;
  return input.hasRosterMembers;
}
