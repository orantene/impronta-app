/**
 * TUL-662 / TUL-1155: a one-talent workspace site (/w/<slug>) starts a
 * talent-less "message the agency" inquiry (source `agency_site`), so the
 * booking assistant used to skip every turn with `no_talent_profile_id` and the
 * guest only ever saw the canned handoff. When the tenant's active roster has
 * exactly one talent, that person is who the assistant speaks for.
 *
 * Pure: takes the roster rows already read, returns the talent id or null.
 */
export function pickSoloRosterTalentId(
  rows: ReadonlyArray<{ talent_profile_id?: string | null; status?: string | null }> | null | undefined,
): string | null {
  const ids = new Set<string>();
  for (const r of rows ?? []) {
    if (r.status === "removed") continue;
    const id = typeof r.talent_profile_id === "string" ? r.talent_profile_id.trim() : "";
    if (id) ids.add(id);
  }
  if (ids.size !== 1) return null;
  return [...ids][0] ?? null;
}
