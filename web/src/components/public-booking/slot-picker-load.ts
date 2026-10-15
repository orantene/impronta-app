/**
 * TUL-977: the /book slot list must never sit on "Cargando horarios…".
 *
 * The picker waited on a bare `fetch` with no deadline, so a slow slots
 * endpoint held the loading line for as long as the request lived before the
 * empty state appeared. The load now has a deadline: past it the picker shows
 * the honest "not available right now" state instead of a spinner that may
 * never end, and the request is aborted.
 */

/** Generous for a cold function, short enough that a guest is never left watching. */
export const SLOT_LOAD_DEADLINE_MS = 6000;

export type SlotLoadResult =
  | { ok: true; slots: string[]; timezone: string | null; reason: string | null }
  | { ok: false };

export async function loadPublicSlots(
  url: string,
  opts: { fetchImpl?: typeof fetch; deadlineMs?: number } = {},
): Promise<SlotLoadResult> {
  const run = opts.fetchImpl ?? fetch;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<SlotLoadResult>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve({ ok: false });
    }, opts.deadlineMs ?? SLOT_LOAD_DEADLINE_MS);
  });
  const load = (async (): Promise<SlotLoadResult> => {
    try {
      const res = await run(url, { cache: "no-store", signal: controller?.signal });
      const body = (await res.json()) as { slots?: unknown; timezone?: unknown; reason?: unknown };
      if (!res.ok) return { ok: false };
      return {
        ok: true,
        slots: Array.isArray(body.slots) ? body.slots.filter((s): s is string => typeof s === "string") : [],
        timezone: typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : null,
        reason: typeof body.reason === "string" ? body.reason : null,
      };
    } catch {
      return { ok: false };
    }
  })();
  try {
    return await Promise.race([load, deadline]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
