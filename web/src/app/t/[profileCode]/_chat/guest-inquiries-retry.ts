/**
 * guest-inquiries-retry: when the guest list must be refetched.
 *
 * On a COLD resume the first list fetch can race the guest-session settle
 * (cookie to forwarded header) and come back without the inquiry she is
 * resumed into. The old rule retried ONCE after 500ms, which lost the race on
 * slow cold starts (e2e E1: the expanded left list said "no requests" while the
 * thread was open). A resumed inquiry MUST be listable, so keep asking, with a
 * growing delay and a hard cap so a genuinely unlisted draft never loops.
 *
 * PURE: no timers here.
 */

/** 400, 800, 1600, 3200, 5000 ms; then stop. */
export const LIST_RETRY_DELAYS_MS: readonly number[] = [400, 800, 1600, 3200, 5000];

/**
 * @param attempt how many retries have already been scheduled (0 on the first fetch's result)
 * @param activeInquiryId the resumed/active inquiry, or null when none
 * @param listedIds ids the fetch returned
 * @returns the delay before the next refetch, or null to stop
 */
export function nextListRetryDelayMs(
  attempt: number,
  activeInquiryId: string | null,
  listedIds: readonly string[],
): number | null {
  if (!activeInquiryId) return null;
  if (listedIds.includes(activeInquiryId)) return null;
  return LIST_RETRY_DELAYS_MS[attempt] ?? null;
}
