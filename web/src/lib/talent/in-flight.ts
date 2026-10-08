/**
 * Share one in-flight promise per key (TUL-220).
 *
 * The Profile page mounts two checklist hooks at once and each fired the same
 * two server actions; server actions run one at a time per client, so the
 * duplicates queued behind each other. Concurrent callers with the same key now
 * get the SAME promise; the entry is dropped as soon as it settles, so a later
 * call (after a save) re-reads.
 */
const pending = new Map<string, Promise<unknown>>();

export function shareInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const p = run().finally(() => {
    if (pending.get(key) === p) pending.delete(key);
  });
  pending.set(key, p);
  return p;
}
