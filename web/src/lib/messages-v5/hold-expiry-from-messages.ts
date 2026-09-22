/**
 * Read the newest live hold expiry from thread cards (D-MSG-78 seam close for
 * `holdExpiresAt`). Professional times and table/service cards stash the TTL
 * on the message payload when the client picks; the shell feeds that into
 * `deriveTasks` so "Hold expired" can surface without a separate engine reader.
 */
import type { ThreadMessage } from "@/lib/messaging/types";

const HOLD_KINDS = new Set(["professional_times", "service_card", "tickets_card", "class_card"]);

/** Newest ISO expiry among private-thread hold-capable cards, or null. */
export function latestHoldExpiresAt(
  messages: readonly ThreadMessage[] | null | undefined,
): string | null {
  if (!messages?.length) return null;
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const m of messages) {
    if (m.deletedAt) continue;
    if (m.thread === "group") continue;
    if (!HOLD_KINDS.has(String(m.kind))) continue;
    const raw = m.payload?.holdExpiresAt;
    if (typeof raw !== "string" || !raw) continue;
    const ms = Date.parse(raw);
    if (!Number.isFinite(ms)) continue;
    // Prefer the chronologically latest expiry (most recent pick wins).
    if (ms >= bestMs) {
      bestMs = ms;
      best = raw;
    }
  }
  return best;
}
