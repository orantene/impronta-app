/**
 * Who may trigger the changelog sync (TUL-1390). Pure, constant-time.
 *
 *  - Vercel cron: `Authorization: Bearer $CRON_SECRET` (same as every /api/cron route).
 *  - Notion "Publish now" button webhook: header `x-changelog-sync-secret:
 *    $CHANGELOG_SYNC_SECRET`. A separate secret so the one pasted into Notion
 *    can be rotated without touching every cron.
 */
import { timingSafeEqual } from "node:crypto";

export const CHANGELOG_SYNC_SECRET_HEADER = "x-changelog-sync-secret";

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type SyncSecrets = { cronSecret?: string; syncSecret?: string };

export function isAuthorizedSyncRequest(
  getHeader: (name: string) => string | null,
  secrets: SyncSecrets,
): boolean {
  const cron = secrets.cronSecret?.trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(getHeader("authorization") ?? "")?.[1];
  if (cron && bearer && sameSecret(bearer, cron)) return true;

  const sync = secrets.syncSecret?.trim();
  const provided = getHeader(CHANGELOG_SYNC_SECRET_HEADER)?.trim();
  return Boolean(sync && provided && sameSecret(provided, sync));
}
