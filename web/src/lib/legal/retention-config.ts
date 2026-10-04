/**
 * Retention periods (owner decision 2026-10-01). LEGAL_REVIEW_PENDING.
 * The retention cron reads its periods from here and stays a DRY RUN unless
 * RETENTION_ENFORCE is exactly "true". The privacy page states these periods.
 */
export const RETENTION_PERIODS = {
  /** Messages and bookings: years after the last activity. */
  messagesAndBookingsYears: 3,
  /** Deleted accounts: days after the grace period ends. */
  deletedAccountPurgeDaysAfterGrace: 30,
  /** Length of the account deletion grace period, in days. */
  deletedAccountGraceDays: 14,
  /** Security and error logs, in days. */
  logsDays: 90,
} as const;

export function isRetentionEnforced(env: Record<string, string | undefined> = process.env): boolean {
  return env.RETENTION_ENFORCE === "true";
}

/** The mode the retention cron must run in. Anything but "true" is a dry run. */
export function retentionMode(env: Record<string, string | undefined> = process.env): "enforce" | "dry-run" {
  return isRetentionEnforced(env) ? "enforce" : "dry-run";
}
