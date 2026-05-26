import { talentPlanToTier } from "@/lib/access/talent-membership";
import { isTalentPersonalSectionTypeKey } from "@/lib/site-admin/sections/talent-personal-section-keys";

import { isTemplateAllowedForTier } from "./templates/registry";
import type { TalentSiteTemplateKey } from "./templates/types";
import type { TalentSiteCompositionMode, TalentSiteSnapshot } from "./types";

export type TalentSiteValidationResult =
  | { ok: true; snapshot: TalentSiteSnapshot }
  | { ok: false; error: string; code?: "snapshot_too_large" | "invalid_snapshot" };

const MAX_SLOTS = 20;
const MAX_SNAPSHOT_BYTES = 256 * 1024;
const MAX_PROP_STRING = 8000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTemplateKey(value: unknown): value is TalentSiteTemplateKey {
  return (
    value === "tulala-digital" ||
    value === "roster" ||
    value === "editorial" ||
    value === "studio" ||
    value === "stage" ||
    value === "creator" ||
    value === "epk"
  );
}

function isCompositionMode(value: unknown): value is TalentSiteCompositionMode {
  return value === "template" || value === "custom";
}

/** Backward-compat defaults for pre-migration Max snapshots. */
export function normalizeTalentSiteSnapshot(raw: TalentSiteSnapshot): TalentSiteSnapshot {
  return {
    ...raw,
    templateKey: isTemplateKey(raw.templateKey) ? raw.templateKey : "roster",
    compositionMode: isCompositionMode(raw.compositionMode) ? raw.compositionMode : "template",
  };
}

export function parseTalentSiteSnapshot(raw: unknown): TalentSiteSnapshot | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== 1) return null;
  if (raw.siteKind !== "talent_personal") return null;
  if (!Array.isArray(raw.slots)) return null;
  if (!isRecord(raw.fields)) return null;

  const parsed = raw as unknown as TalentSiteSnapshot;
  return normalizeTalentSiteSnapshot(parsed);
}

function validatePropStrings(props: Record<string, unknown>, path = ""): string | null {
  for (const [key, value] of Object.entries(props)) {
    const p = path ? `${path}.${key}` : key;
    if (typeof value === "string" && value.length > MAX_PROP_STRING) {
      return `Property ${p} exceeds maximum length.`;
    }
    if (isRecord(value)) {
      const nested = validatePropStrings(value, p);
      if (nested) return nested;
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === "string" && item.length > MAX_PROP_STRING) {
          return `Property ${p}[${i}] exceeds maximum length.`;
        }
        if (isRecord(item)) {
          const nested = validatePropStrings(item, `${p}[${i}]`);
          if (nested) return nested;
        }
      }
    }
  }
  return null;
}

export function validateTalentSiteSnapshot(
  raw: unknown,
  opts?: { planKey?: string },
): TalentSiteValidationResult {
  const snapshot = parseTalentSiteSnapshot(raw);
  if (!snapshot) {
    return { ok: false, error: "Invalid personal site snapshot.", code: "invalid_snapshot" };
  }

  if (snapshot.siteKind !== "talent_personal") {
    return { ok: false, error: "Snapshot must use site kind talent_personal." };
  }

  const title = snapshot.fields?.title?.trim();
  if (!title) {
    return { ok: false, error: "Site title is required." };
  }

  if (snapshot.slots.length > MAX_SLOTS) {
    return {
      ok: false,
      error: `Too many sections (max ${MAX_SLOTS}).`,
      code: "snapshot_too_large",
    };
  }

  const serialized = JSON.stringify(snapshot);
  if (serialized.length > MAX_SNAPSHOT_BYTES) {
    return {
      ok: false,
      error: "Site snapshot is too large.",
      code: "snapshot_too_large",
    };
  }

  const slotKeys = new Set<string>();
  for (const slot of snapshot.slots) {
    if (!slot.slotKey?.trim()) {
      return { ok: false, error: "Each section must have a slot key." };
    }
    if (slotKeys.has(slot.slotKey)) {
      return { ok: false, error: `Duplicate slot key: ${slot.slotKey}` };
    }
    slotKeys.add(slot.slotKey);

    if (!isTalentPersonalSectionTypeKey(slot.sectionTypeKey)) {
      return {
        ok: false,
        error: `Section type "${slot.sectionTypeKey}" is not allowed on talent personal sites.`,
      };
    }

    const propErr = validatePropStrings(slot.props ?? {});
    if (propErr) {
      return { ok: false, error: propErr, code: "snapshot_too_large" };
    }
  }

  if (opts?.planKey) {
    const tier = talentPlanToTier(opts.planKey);
    if (snapshot.compositionMode === "custom" && tier !== "max") {
      return {
        ok: false,
        error: "Upgrade to Max to customize sections and build your service website.",
      };
    }
    if (isTemplateKey(snapshot.templateKey) && !isTemplateAllowedForTier(snapshot.templateKey, tier)) {
      return {
        ok: false,
        error: "Upgrade to Pro to choose premium templates.",
      };
    }
  }

  return { ok: true, snapshot };
}
