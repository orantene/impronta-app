/**
 * Master spine — five separation layers kept independent.
 *
 * Business activities, capability entitlements, role/relationship, vocabulary
 * preset, and visual theme must not collapse into one enum. Effective action
 * availability is the explicit intersection of capability ∩ permission ∩
 * ownership ∩ record state. Settings inherit platform → workspace preset →
 * override → user preference, with a Reset that previews what changes.
 */

import type { IndustryPresetId } from "@/lib/words/presets";
import {
  FAMILY_DEFAULT_PRESET,
  type BusinessFamilyId,
  type BusinessType,
} from "@/lib/words/business-types";
import type { CapabilityKey, StartingView, VocabularyNoun } from "@/lib/words/theme-layers";

export type SeparationLayer =
  | "activities"
  | "capabilities"
  | "role_relationship"
  | "vocabulary_preset"
  | "visual_theme";

export const SEPARATION_LAYERS: readonly SeparationLayer[] = [
  "activities",
  "capabilities",
  "role_relationship",
  "vocabulary_preset",
  "visual_theme",
] as const;

export type BusinessActivity =
  | "appointments"
  | "events"
  | "classes"
  | "reservations"
  | "pos"
  | "catalog"
  | "projects"
  | "messaging";

export type RecordState =
  | "draft"
  | "published"
  | "archived"
  | "confirmed"
  | "cancelled"
  | "paid"
  | "pending_payment"
  | "fulfilled";

export type EffectiveAvailabilityInput = {
  /** Plan / workspace entitlement. */
  capability: boolean;
  /** Role permission for this action. */
  permission: boolean;
  /** Actor owns or is assigned to the record (when ownership matters). */
  ownership: boolean;
  /** Record is in a state that allows the action. */
  recordAllows: boolean;
};

export type EffectiveAvailability =
  | { available: true }
  | {
      available: false;
      blockedBy: Array<"capability" | "permission" | "ownership" | "record_state">;
    };

/** Explicit intersection — never infer availability from a single flag. */
export function effectiveAvailability(input: EffectiveAvailabilityInput): EffectiveAvailability {
  const blockedBy: Array<"capability" | "permission" | "ownership" | "record_state"> = [];
  if (!input.capability) blockedBy.push("capability");
  if (!input.permission) blockedBy.push("permission");
  if (!input.ownership) blockedBy.push("ownership");
  if (!input.recordAllows) blockedBy.push("record_state");
  if (blockedBy.length > 0) return { available: false, blockedBy };
  return { available: true };
}

export type SettingsLayer = "platform" | "workspace_preset" | "override" | "user_preference";

export type SettingsChain<T> = {
  platform: T;
  workspacePreset?: T | null;
  override?: T | null;
  userPreference?: T | null;
};

/** Nearest non-null wins: user → override → preset → platform. */
export function resolveSettingsValue<T>(chain: SettingsChain<T>): {
  value: T;
  source: SettingsLayer;
} {
  if (chain.userPreference != null) return { value: chain.userPreference, source: "user_preference" };
  if (chain.override != null) return { value: chain.override, source: "override" };
  if (chain.workspacePreset != null) {
    return { value: chain.workspacePreset, source: "workspace_preset" };
  }
  return { value: chain.platform, source: "platform" };
}

export type SettingsResetPreview<T extends Record<string, unknown>> = {
  /** Keys that would change if Reset applied. */
  changingKeys: readonly (keyof T & string)[];
  before: T;
  after: T;
};

/**
 * Preview a Reset to the workspace preset (or platform when no preset).
 * Does not write — the UI confirms from this preview.
 */
export function previewSettingsReset<T extends Record<string, unknown>>(input: {
  current: T;
  platform: T;
  workspacePreset?: T | null;
}): SettingsResetPreview<T> {
  const after = { ...(input.workspacePreset ?? input.platform) } as T;
  const changingKeys = (Object.keys(input.current) as Array<keyof T & string>).filter(
    (key) => input.current[key] !== after[key],
  );
  return { changingKeys, before: input.current, after };
}

export type MasterSpine = {
  type: BusinessType;
  activities: readonly BusinessActivity[];
  capabilities: readonly CapabilityKey[];
  vocabulary: VocabularyNoun;
  startingView: StartingView;
  visualThemePreset: IndustryPresetId;
};

export function suggestedPresetForFamily(family: BusinessFamilyId): IndustryPresetId {
  return FAMILY_DEFAULT_PRESET[family];
}

export function activitiesForCapabilities(
  capabilities: readonly CapabilityKey[],
): BusinessActivity[] {
  const out: BusinessActivity[] = [];
  const map: Partial<Record<CapabilityKey, BusinessActivity>> = {
    appointments: "appointments",
    events: "events",
    classes: "classes",
    reservations: "reservations",
    pos: "pos",
    menu: "catalog",
    preparation: "pos",
  };
  for (const cap of capabilities) {
    const activity = map[cap];
    if (activity && !out.includes(activity)) out.push(activity);
  }
  return out;
}
