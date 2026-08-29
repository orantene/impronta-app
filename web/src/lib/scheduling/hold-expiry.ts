/**
 * PostgREST filter for talent_holds that are still live.
 *
 * A hold with expires_at NULL never lapses. A hold with expires_at in the
 * past is dead — the gist exclusion cannot see that, so every reader MUST
 * apply this filter (or delete the row). Shared so staff hold-actions and
 * the public busy loader cannot drift.
 */

export function unexpiredHoldOrFilter(now: Date = new Date()): string {
  return `expires_at.is.null,expires_at.gt.${now.toISOString()}`;
}

export function isHoldUnexpired(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (expiresAt == null || expiresAt === "") return true;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return false;
  return ms > now.getTime();
}
