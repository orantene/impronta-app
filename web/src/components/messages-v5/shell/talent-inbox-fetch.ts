import type { ActionResult, InboxFilter, InboxRow } from "@/lib/messaging/types";

export type TalentInboxResult = ActionResult<{ rows: InboxRow[]; unreadCount: number }>;
type InboxResult = TalentInboxResult;

/**
 * How long one GET may take before it reads as "unavailable". A plain fetch is
 * not in Next's router action queue, so it cannot be discarded the way a
 * server action can (settle-server-action.ts); it only needs a ceiling for a
 * dead network. Callers that wrap it in safeLoadInbox pass this as the settle
 * budget too, so a slow-but-healthy read (3-4 s cold) is not cut off at the
 * 4 s server-action stall budget and shown as "nothing needs a reply".
 */
export const TALENT_INBOX_FETCH_BUDGET_MS = 20_000;

/** In-flight reads, keyed by filter: concurrent callers share one request. */
const inflight = new Map<InboxFilter, Promise<InboxResult>>();

/**
 * The server-rendered first read (the inbox page starts it while the shell
 * hydrates). Callers share it while it is pending; once it has settled, the
 * first caller takes it and it is gone, so a later reload (after a write)
 * always goes to the network.
 */
const primed = new Map<InboxFilter, { promise: Promise<InboxResult>; settled: boolean }>();

/** Registers the server's first read for `filter`. Idempotent per promise. */
export function primeTalentInbox(filter: InboxFilter, result: Promise<InboxResult>): void {
  const current = primed.get(filter);
  if (current?.promise === result) return;
  const entry = { promise: result, settled: false };
  primed.set(filter, entry);
  void result.then(
    () => {
      entry.settled = true;
    },
    () => {
      entry.settled = true;
    },
  );
}

/** Test seam: forget in-flight and primed reads. */
export function resetTalentInboxFetchForTests(): void {
  inflight.clear();
  primed.clear();
}

async function getInbox(filter: InboxFilter, fetchImpl: typeof fetch): Promise<InboxResult> {
  const controller = typeof AbortController === "undefined" ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), TALENT_INBOX_FETCH_BUDGET_MS) : undefined;
  try {
    const res = await fetchImpl(`/api/talent/inbox?filter=${encodeURIComponent(filter)}`, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: controller?.signal,
    });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const body = (await res.json()) as Partial<InboxResult> | null;
    if (body && body.ok === true && Array.isArray((body as { rows?: unknown }).rows)) return body as InboxResult;
    if (body && body.ok === false && typeof (body as { reason?: unknown }).reason === "string") return body as InboxResult;
    return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Reads the talent inbox through GET /api/talent/inbox instead of the server
 * action, so the read is outside Next's router action queue (see the route
 * for the incident). Non-2xx, a network error or a malformed body becomes
 * "unavailable". Concurrent calls for the same filter share one request, and
 * the server-rendered first read (primeTalentInbox) is used when present.
 */
export function fetchTalentInbox(
  input: { locationSlug: string; filter: InboxFilter },
  fetchImpl: typeof fetch = fetch,
): Promise<InboxResult> {
  const { filter } = input;
  const seed = primed.get(filter);
  if (seed) {
    if (seed.settled) primed.delete(filter);
    return seed.promise.then(
      (result) => (result.ok ? result : fetchTalentInbox(input, fetchImpl)),
      () => fetchTalentInbox(input, fetchImpl),
    );
  }
  const pending = inflight.get(filter);
  if (pending) return pending;
  const request = getInbox(filter, fetchImpl).finally(() => {
    if (inflight.get(filter) === request) inflight.delete(filter);
  });
  inflight.set(filter, request);
  return request;
}
