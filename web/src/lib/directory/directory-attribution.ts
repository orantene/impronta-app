/**
 * Pure helpers for the public directory (TUL-735).
 *
 * Independents live on the platform hub's roster, so the discover index
 * reports the hub as their "agency". The card must not say "via Tulala" for
 * them, so the hub is treated as no agency at all.
 */
export type DirectoryAgencyFields = {
  agencyName: string | null;
  agencyTenantId: string | null;
  isExclusive: boolean;
};

export function resolveDirectoryAgencyAttribution(
  row: DirectoryAgencyFields,
  hubTenantId: string | null,
): DirectoryAgencyFields {
  if (hubTenantId && row.agencyTenantId === hubTenantId) {
    return { agencyName: null, agencyTenantId: null, isExclusive: false };
  }
  return row;
}

/**
 * PostgREST `or()` filter so search finds a talent by display name or by
 * profile code (e.g. TAL-93940). Characters that would break the or()
 * grammar are replaced with spaces; null when nothing searchable is left.
 */
export function buildDirectoryQueryOrFilter(q: string): string | null {
  const term = q.replace(/[,()%*\\]/g, " ").trim();
  if (!term) return null;
  const pat = `%${term}%`;
  return `display_name.ilike.${pat},profile_code.ilike.${pat}`;
}
