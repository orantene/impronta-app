import { isTalentPersonalSectionTypeKey } from "@/lib/site-admin/sections/talent-personal-section-keys";

import type { TalentSiteSnapshot } from "./types";

export type TalentSiteValidationResult =
  | { ok: true; snapshot: TalentSiteSnapshot }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseTalentSiteSnapshot(raw: unknown): TalentSiteSnapshot | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== 1) return null;
  if (raw.siteKind !== "talent_personal") return null;
  if (!Array.isArray(raw.slots)) return null;
  if (!isRecord(raw.fields)) return null;

  return raw as unknown as TalentSiteSnapshot;
}

export function validateTalentSiteSnapshot(raw: unknown): TalentSiteValidationResult {
  const snapshot = parseTalentSiteSnapshot(raw);
  if (!snapshot) {
    return { ok: false, error: "Invalid personal site snapshot." };
  }

  if (snapshot.siteKind !== "talent_personal") {
    return { ok: false, error: "Snapshot must use site kind talent_personal." };
  }

  const title = snapshot.fields?.title?.trim();
  if (!title) {
    return { ok: false, error: "Site title is required." };
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
  }

  return { ok: true, snapshot };
}
