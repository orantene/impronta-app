"use client";

/**
 * A per-visit id, so events can be stitched into a journey.
 *
 * Every analytics event we have ever written carries a null `session_id`:
 * 3,309 of them in a recent thirty day window, none joinable. The API has
 * always accepted the field and the client never sent it, so the contract was
 * one-sided and nobody noticed. `talent-analytics-group.ts` computes "unique
 * viewers" from distinct non-null session ids, which means that metric has
 * been silently zero for its whole life.
 *
 * The consequence is that we could count events and never follow a person
 * through them. "Of the people who saw pricing, how many signed up" was
 * unanswerable, not for lack of data but because nothing linked one row to
 * the next.
 *
 * SCOPE IS DELIBERATE. This is a VISIT id in sessionStorage, not a visitor id
 * in localStorage. It dies when the tab closes and never links two visits by
 * the same person. That is enough to stitch a funnel, which is the problem
 * being solved, and it avoids turning a measurement fix into a decision about
 * persistent tracking. A stable `tulala_visitor_seed` already exists for
 * experiment bucketing; this deliberately does not reuse or extend it.
 *
 * The value is an opaque random id. No personal data, nothing derived from
 * the visitor, nothing shared with a third party.
 */

const KEY = "tulala.session.v1";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * The id for this visit, created on first use.
 *
 * Returns null on the server and when storage is unavailable. Null is honest:
 * the event still records, it simply cannot be stitched, which is exactly the
 * state everything was in before. Analytics must never break a page.
 */
export function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = newId();
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Private mode, blocked storage, quota.
    return null;
  }
}
