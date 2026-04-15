/** Close inquiry reasons — aligned with product copy; DB may use different legacy values. */
export const CLOSE_REASONS = [
  "client_cancelled",
  "budget_mismatch",
  "talent_unavailable",
  "duplicate",
  "no_response",
  "other",
] as const;

export type CloseReason = (typeof CLOSE_REASONS)[number];
