/**
 * THEME RELEASES (F127 backfill): the bell rules as a PURE plan over existing
 * rows, used by `scripts/theme-releases/dedupe-theme-bells.mts`.
 *   1. keep only the newest unread update bell per talent and design
 *   2. mark read any bell whose update rows are all closed (applied / dismissed)
 * Idempotent: a second run over the result plans nothing.
 */
export interface BellRecord {
  id: string;
  user_id: string;
  origin_event_id: string;
  created_at?: string | null;
  target_payload: { design?: string; toVersion?: number } | null;
}

export interface BellRowRecord {
  release_id: string;
  state: string;
  /** The talent (user) the row belongs to. */
  user_id: string;
}

export interface BellPlan {
  markRead: Array<{ id: string; reason: "superseded" | "rows_closed" }>;
  kept: string[];
}

const CLOSED = new Set(["applied", "dismissed"]);

export function planBellDedupe(unread: ReadonlyArray<BellRecord>, rows: ReadonlyArray<BellRowRecord>): BellPlan {
  const markRead: BellPlan["markRead"] = [];
  const marked = new Set<string>();

  // 2. all rows closed -> resolved
  const rowsBy = new Map<string, string[]>();
  for (const r of rows) rowsBy.set(`${r.user_id}:${r.release_id}`, [...(rowsBy.get(`${r.user_id}:${r.release_id}`) ?? []), r.state]);
  for (const b of unread) {
    const states = rowsBy.get(`${b.user_id}:${b.origin_event_id}`);
    if (states && states.length > 0 && states.every((s) => CLOSED.has(s))) {
      markRead.push({ id: b.id, reason: "rows_closed" });
      marked.add(b.id);
    }
  }

  // 1. newest unread per (user, design)
  const groups = new Map<string, BellRecord[]>();
  for (const b of unread) {
    if (marked.has(b.id)) continue;
    const k = `${b.user_id}:${b.target_payload?.design ?? ""}`;
    groups.set(k, [...(groups.get(k) ?? []), b]);
  }
  const kept: string[] = [];
  for (const list of groups.values()) {
    const sorted = [...list].sort(
      (a, b) =>
        (b.target_payload?.toVersion ?? 0) - (a.target_payload?.toVersion ?? 0) ||
        String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")) ||
        a.id.localeCompare(b.id),
    );
    kept.push(sorted[0]!.id);
    for (const old of sorted.slice(1)) markRead.push({ id: old.id, reason: "superseded" });
  }
  return { markRead, kept };
}
