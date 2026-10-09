/**
 * TUL-389 bounce: one-shot migrate of the legacy hub localStorage read set
 * (`tulala_notif_read_v1`) onto server `user_notifications.read_at`.
 *
 * Pure helpers only — the React hub owns the localStorage read/clear and the
 * server-action call. Kept client-safe so tests run without server-only.
 */

/** Former hub key; unread no longer writes here after TUL-389. */
export const LEGACY_NOTIF_READ_KEY = "tulala_notif_read_v1";

const NOTIF_PREFIX = "notif-";

/**
 * Hub item ids for real rows are `notif-<uuid>`. Strip the prefix for the
 * server mark-read action. Fixture / derived ids (`pending-*`, `rev-203`, …)
 * stay session-optimistic only — there is no `user_notifications` row.
 */
export function realNotificationIdsFromLegacyReadIds(
  ids: Iterable<string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    if (typeof raw !== "string" || !raw.startsWith(NOTIF_PREFIX)) continue;
    const id = raw.slice(NOTIF_PREFIX.length);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Parse the JSON array stored under `tulala_notif_read_v1`. Returns an empty
 * set on missing / malformed values (same tolerance as the old hub readSet).
 */
export function parseLegacyReadIdSet(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((x): x is string => typeof x === "string" && x.length > 0),
    );
  } catch {
    return new Set();
  }
}
