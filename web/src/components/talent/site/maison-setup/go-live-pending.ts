/** F137: one rule for "has unpublished changes", shared by the live card and
 *  the builder chip (both read `loadGoLiveSummary`). */
export function goLiveHasPending(summary: {
  unpublishedCount: number;
  firstPublish: unknown;
}): boolean {
  return summary.unpublishedCount > 0 || summary.firstPublish != null;
}
