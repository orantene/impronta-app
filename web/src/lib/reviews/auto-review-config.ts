/**
 * TUL-1328: the kill switch and the first-run cutoff of the automatic review
 * request. PURE (takes the environment as an argument).
 *
 *   AUTO_REVIEW_REQUESTS_ENABLED   "1" or "true" turns the feature on. DEFAULT OFF.
 *   AUTO_REVIEW_REQUESTS_FROM      ISO date or datetime: only bookings that ENDED at or
 *                                  after it are asked. REQUIRED when enabled; a missing,
 *                                  unparseable or future value keeps the feature off, so
 *                                  switching it on can never back-fill past clients.
 *
 * Set `..._FROM` to the moment the feature is switched on (or later). Setting
 * `..._ENABLED` back to anything else is the kill switch; the next run does nothing.
 */

export type AutoReviewConfig =
  | { enabled: true; cutoff: Date }
  | { enabled: false; reason: "off" | "no_cutoff" | "bad_cutoff" | "future_cutoff" };

export function parseAutoReviewConfig(
  env: Record<string, string | undefined>,
  now: Date,
): AutoReviewConfig {
  const flag = (env.AUTO_REVIEW_REQUESTS_ENABLED ?? "").trim().toLowerCase();
  if (flag !== "1" && flag !== "true") return { enabled: false, reason: "off" };
  const raw = (env.AUTO_REVIEW_REQUESTS_FROM ?? "").trim();
  if (!raw) return { enabled: false, reason: "no_cutoff" };
  const cutoff = new Date(raw);
  if (Number.isNaN(cutoff.getTime())) return { enabled: false, reason: "bad_cutoff" };
  // A cutoff in the future just means "not yet": nothing qualifies before it anyway,
  // but a typo years ahead must not look like a working setup.
  if (cutoff.getTime() > now.getTime() + 24 * 3_600_000) return { enabled: false, reason: "future_cutoff" };
  return { enabled: true, cutoff };
}
