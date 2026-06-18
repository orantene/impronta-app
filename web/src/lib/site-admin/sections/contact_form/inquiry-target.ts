/**
 * FORMS-2b — pure helpers bridging the shared (code-keyed) TalentPicker to the
 * contact_form schema's single id-keyed `inquiryTargetTalentId` field.
 *
 * The reused picker (`TalentPicker`, the same modal featured_talent uses)
 * speaks `profile_code` in and out. But the contact_form inquiry-routing
 * schema persists a single talent UUID (`inquiryTargetTalentId`) — that's what
 * the public submit route roster-validates and feeds to createInquiryFromIntent
 * as `talent.selected_ids`. These pure functions translate between the two
 * vocabularies using a code→id map the widget assembles from resolved hits, so
 * the persisted value is always the talent's id and never a raw code.
 *
 * Kept PURE (no React, no DB) so the persistence contract is unit-testable
 * exactly like the sibling inquiry-routing mapper.
 */

/** Minimal hit shape these helpers need (subset of TalentSearchHit). */
export interface TalentIdentity {
  id: string;
  profileCode: string;
}

/**
 * Reduce the array of confirmed profile_codes coming out of the (single-select)
 * TalentPicker to the one talent id we persist. The picker is launched with
 * `maxCount: 1`, so at most one code is expected; we take the first and map it
 * to its id via `byCode`. Returns `undefined` when:
 *   - nothing was picked (empty array → clears the target), or
 *   - the picked code can't be resolved to an id in the supplied lookup
 *     (defensive: never persist a code masquerading as an id).
 *
 * Persisting `undefined` is the correct "no target" value — an inquiry-mode
 * form with no target becomes a talent-less "message the agency" inquiry, which
 * the routing mapper already supports.
 */
export function pickTargetIdFromConfirmedCodes(
  codes: readonly string[],
  byCode: ReadonlyMap<string, string>,
): string | undefined {
  const first = codes.find((c) => c && c.trim().length > 0);
  if (!first) return undefined;
  return byCode.get(first) ?? undefined;
}

/**
 * Build the bidirectional lookup the widget threads through the picker: a
 * code→id and id→code map assembled from every hit the widget has resolved or
 * searched this session. Later hits win on key collisions (none expected —
 * code and id are both unique per talent).
 */
export function buildIdentityMaps(hits: readonly TalentIdentity[]): {
  byCode: Map<string, string>;
  byId: Map<string, string>;
} {
  const byCode = new Map<string, string>();
  const byId = new Map<string, string>();
  for (const hit of hits) {
    if (!hit.id || !hit.profileCode) continue;
    byCode.set(hit.profileCode, hit.id);
    byId.set(hit.id, hit.profileCode);
  }
  return { byCode, byId };
}

/**
 * Translate the currently-persisted target id into the profile_code the
 * TalentPicker needs as `initialCodes`. Returns an empty array when there is
 * no target or the id isn't (yet) resolvable, so the picker simply opens with
 * no pre-selection rather than seeding a bogus code.
 */
export function seedCodesForTargetId(
  targetId: string | undefined,
  byId: ReadonlyMap<string, string>,
): string[] {
  if (!targetId) return [];
  const code = byId.get(targetId);
  return code ? [code] : [];
}
