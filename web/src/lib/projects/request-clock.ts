import "server-only";

/**
 * The one clock a Projects or Clients page reads, once per request.
 *
 * `project-record.ts` and `client-record.ts` take the instant as an
 * ARGUMENT and never read one themselves, so a page reads it here, at the
 * top, and every "overdue" and "upcoming" below is judged against the same
 * millisecond. Kept out of the component body because a server page is
 * rendered once per request and the clock is part of that request, not of
 * a render that could repeat.
 */
export function requestNowMs(): number {
  return Date.now();
}
