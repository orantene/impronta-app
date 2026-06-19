/**
 * rollout-ramp-cron-logic.ts — PURE guard helpers extracted from the G8 cron
 * route so they can be unit-tested without a Next.js Request or Supabase client.
 *
 * Three functions:
 *   parseRolloutCronFlag  — parse the BUILDER_ROLLOUT_CRON_ENABLED env var.
 *   checkCronSecret       — validate an Authorization header against CRON_SECRET.
 *   buildRampPatch        — compute the DB patch for one ramp-advance tick.
 *
 * No "use server", no Next.js imports, no Supabase — pure TS leaf, safe for the
 * tsx test runner and safe to import in any environment.
 */

import {
  computeRampStep,
  DEFAULT_RAMP_STEP,
} from "@/lib/site-admin/builder-core/templates/rollout-ramp";

// ── Flag parsing ──────────────────────────────────────────────────────────────

/**
 * Returns `true` when the env-var value is "1", "true", "yes", or "on"
 * (case-insensitive, after trimming). Everything else — undefined, "0",
 * "false", empty string — is falsy.
 */
export function parseRolloutCronFlag(
  envValue: string | undefined,
): boolean {
  const v = (envValue ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

// ── Secret validation ─────────────────────────────────────────────────────────

/**
 * Validate a cron Authorization header against the expected secret.
 * The header must be `Bearer <secret>` (case-insensitive prefix, one or more
 * spaces). Returns `{ authorized: true }` on a match, `{ authorized: false }`
 * otherwise (null/missing header, wrong secret, or bare secret without Bearer).
 */
export function checkCronSecret(
  authorizationHeader: string | null | undefined,
  expectedSecret: string,
): { authorized: boolean } {
  if (!authorizationHeader) return { authorized: false };
  // Strip the "Bearer " prefix (case-insensitive, any whitespace after it).
  // If the header has no "Bearer " prefix, replace() is a no-op and token ===
  // authorizationHeader — so we can detect the "bare secret" case.
  const token = authorizationHeader.replace(/^Bearer\s+/i, "");
  if (token === authorizationHeader) {
    // No "Bearer " prefix at all — unauthorized even if the secret matches.
    return { authorized: false };
  }
  return { authorized: token === expectedSecret };
}

// ── Ramp patch builder ────────────────────────────────────────────────────────

export interface RampRow {
  id: string;
  rollout_percentage: number;
  rollout_ramp_to: number | null;
  rollout_ramp_at: string | null;
}

export interface RampPatch {
  rollout_percentage: number;
  rollout_ramp_to?: null;
  rollout_ramp_at?: string | null;
}

/**
 * Compute the DB update patch for one ramp-advance tick given a template row
 * and the current time. Returns `null` when `row.rollout_ramp_to` is null
 * (the cron caller should skip this row).
 *
 * When the ramp reaches the target (`stepResult.complete`), the patch clears
 * both ramp columns (`rollout_ramp_to: null, rollout_ramp_at: null`).
 * Otherwise, it re-arms `rollout_ramp_at` to `now + rampTickIntervalMs`.
 *
 * @param rampTickIntervalMs — passed as a parameter so tests can use small
 *   values and assert on the re-arm timestamp without coupling to the 24h
 *   production constant.
 */
export function buildRampPatch(
  row: RampRow,
  now: Date,
  rampTickIntervalMs: number,
): RampPatch | null {
  if (row.rollout_ramp_to === null) return null;

  const stepResult = computeRampStep({
    current: row.rollout_percentage,
    target: row.rollout_ramp_to,
    step: DEFAULT_RAMP_STEP,
  });

  const patch: RampPatch = {
    rollout_percentage: stepResult.next,
  };

  if (stepResult.complete) {
    patch.rollout_ramp_to = null;
    patch.rollout_ramp_at = null;
  } else {
    patch.rollout_ramp_at = new Date(now.getTime() + rampTickIntervalMs).toISOString();
  }

  return patch;
}
