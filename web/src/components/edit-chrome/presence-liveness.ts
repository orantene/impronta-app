/**
 * Pure presence helpers (TUL-81): tab-liveness expiry and one-avatar-per-user.
 *
 * Supabase Realtime keeps a closed tab's presence entry until its socket times
 * out, so "You have this page open in another tab" lingered after the other tab
 * was gone. Every tab now stamps a heartbeat (`ts`) into its tracked payload;
 * a peer whose heartbeat is older than the TTL is treated as gone.
 */

/** How often a live tab refreshes its presence payload. */
export const PRESENCE_HEARTBEAT_MS = 3_000;
/** A peer silent for longer than this is considered closed (3 missed beats + slack). */
export const PRESENCE_PEER_TTL_MS = 10_000;

export type PresenceTrackLike = {
  tabId?: string;
  userId?: string;
  name?: string;
  /** Epoch ms of the peer's last heartbeat. Absent on pre-heartbeat clients. */
  ts?: number;
};

/**
 * True when a peer should still count. A peer without a heartbeat (old client)
 * is kept, so a mixed-version rollout never hides a real co-editor. A `ts` in
 * the far future (clock skew) is clamped to "alive".
 */
export function isPeerAlive(
  ts: number | undefined,
  now: number,
  ttlMs: number = PRESENCE_PEER_TTL_MS,
): boolean {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return true;
  return now - ts <= ttlMs;
}

export type AvatarEditorLike = {
  id: string;
  userId?: string | null;
  isSelf?: boolean;
};

/**
 * One entry per USER. Tabs without a userId (not yet resolved) stay distinct
 * per tab. Self always wins its group and is listed first; otherwise the first
 * tab seen represents the user. Order of first appearance is otherwise kept.
 */
export function dedupeEditorsByUser<T extends AvatarEditorLike>(
  editors: readonly T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const e of editors) {
    const key = e.userId ? `u:${e.userId}` : `t:${e.id}`;
    const prev = byKey.get(key);
    if (!prev || (e.isSelf && !prev.isSelf)) byKey.set(key, e);
  }
  const out = [...byKey.values()];
  const selfIdx = out.findIndex((e) => e.isSelf);
  if (selfIdx > 0) out.unshift(...out.splice(selfIdx, 1));
  return out;
}
