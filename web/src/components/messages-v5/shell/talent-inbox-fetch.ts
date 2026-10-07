import type { ActionResult, InboxFilter, InboxRow } from "@/lib/messaging/types";

type InboxResult = ActionResult<{ rows: InboxRow[]; unreadCount: number }>;

/**
 * Reads the talent inbox through GET /api/talent/inbox instead of the server
 * action, so the read is outside Next's router action queue (see the route
 * for the incident). Non-2xx or a malformed body becomes "unavailable".
 */
export async function fetchTalentInbox(
  input: { locationSlug: string; filter: InboxFilter },
  fetchImpl: typeof fetch = fetch,
): Promise<InboxResult> {
  const res = await fetchImpl(`/api/talent/inbox?filter=${encodeURIComponent(input.filter)}`, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!res.ok) return { ok: false, reason: "unavailable" };
  const body = (await res.json()) as Partial<InboxResult> | null;
  if (body && body.ok === true && Array.isArray((body as { rows?: unknown }).rows)) return body as InboxResult;
  if (body && body.ok === false && typeof (body as { reason?: unknown }).reason === "string") return body as InboxResult;
  return { ok: false, reason: "unavailable" };
}
