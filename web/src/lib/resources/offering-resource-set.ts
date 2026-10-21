/**
 * Optional extra people and a room on one offering.
 *
 * Couples massage (C02) is two therapists plus one room. Instant book already
 * holds the offering's own talent; companions and the space come from
 * `talent_offerings.attributes.resourceSet` so a page design never hard-codes
 * fixture UUIDs.
 */

export type OfferingResourceSet = {
  companionTalentIds: string[];
  /** Every shared resource the service needs (chair, room, station, bed, bay, unit). TUL-1375. */
  spaceIds: string[];
  /** Legacy single room: the first of `spaceIds` (kept for existing readers). */
  spaceId: string | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return UUID.test(id) ? id : null;
}

export function parseOfferingResourceSet(attributes: unknown): OfferingResourceSet {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    return { companionTalentIds: [], spaceIds: [], spaceId: null };
  }
  const raw = (attributes as { resourceSet?: unknown }).resourceSet;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { companionTalentIds: [], spaceIds: [], spaceId: null };
  }
  const rec = raw as { companionTalentIds?: unknown; spaceId?: unknown; spaceIds?: unknown };
  const companionTalentIds = Array.isArray(rec.companionTalentIds)
    ? [...new Set(rec.companionTalentIds.map(asUuid).filter((id): id is string => id != null))]
    : [];
  const listed = Array.isArray(rec.spaceIds) ? rec.spaceIds.map(asUuid) : [];
  const spaceIds = [...new Set([asUuid(rec.spaceId), ...listed].filter((id): id is string => id != null))];
  return { companionTalentIds, spaceIds, spaceId: spaceIds[0] ?? null };
}
