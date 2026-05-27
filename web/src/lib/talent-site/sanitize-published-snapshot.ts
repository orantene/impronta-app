import { isTalentPersonalSectionTypeKey } from "@/lib/site-admin/sections/talent-personal-section-keys";

import { normalizeTalentSiteSnapshot, parseTalentSiteSnapshot } from "./validation";
import type { TalentSiteSnapshot, TalentSiteSnapshotSection } from "./types";

const BLOCKED_PROP_KEYS = new Set([
  "adminNotes",
  "privateNotes",
  "internalRate",
  "privateEmail",
  "privatePhone",
  "tenantId",
  "agencyPrivate",
]);

function stripProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (BLOCKED_PROP_KEYS.has(key)) continue;
    if (key.toLowerCase().includes("private")) continue;
    if (key.toLowerCase().includes("internal")) continue;
    out[key] = value;
  }
  return out;
}

function sanitizeSlot(slot: TalentSiteSnapshotSection): TalentSiteSnapshotSection | null {
  if (slot.hidden) return null;
  if (!isTalentPersonalSectionTypeKey(slot.sectionTypeKey)) return null;
  return {
    ...slot,
    props: stripProps(slot.props ?? {}),
  };
}

/**
 * Sanitize snapshot before writing to published_snapshot (defense in depth).
 */
export function sanitizePublishedTalentSiteSnapshot(raw: unknown): TalentSiteSnapshot | null {
  const parsed = parseTalentSiteSnapshot(raw);
  if (!parsed) return null;

  const normalized = normalizeTalentSiteSnapshot(parsed);
  const slots = normalized.slots
    .map(sanitizeSlot)
    .filter((s): s is TalentSiteSnapshotSection => s != null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    ...normalized,
    slots,
    fields: {
      title: normalized.fields.title.trim(),
      metaDescription: normalized.fields.metaDescription?.trim().slice(0, 500) ?? null,
      introTagline: normalized.fields.introTagline?.trim().slice(0, 300) ?? null,
    },
  };
}
