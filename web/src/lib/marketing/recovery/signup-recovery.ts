import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Finding the people who tried to sign up and did not finish.
 *
 * A visitor who fills in the form and never completes leaves a row in
 * `saas_marketing_signups` with a null `provisioned_tenant_id`. Until now
 * nothing followed up and nothing recorded that we had tried, so the single
 * highest-intent audience the site produces was simply lost.
 *
 * The selection rules are here rather than in the route so they can be tested
 * without a database or a cron.
 */

/** Wait this long before nudging. Someone mid-signup is not abandoned. */
export const RECOVERY_DELAY_HOURS = 2;

/**
 * Stop after this long. A three week old lead is a cold email, not a helpful
 * reminder, and sending one is how a useful nudge becomes spam.
 */
export const RECOVERY_MAX_AGE_HOURS = 72;

/** Small batches so one bad run cannot mail everyone. */
export const RECOVERY_BATCH_SIZE = 25;

export type RecoveryCandidate = {
  id: string;
  email: string;
  name: string | null;
  business_name: string | null;
  audience: string | null;
  subdomain_wanted: string | null;
  created_at: string;
};

export function recoveryWindow(now: Date): { notAfter: string; notBefore: string } {
  return {
    // Old enough to count as abandoned...
    notAfter: new Date(now.getTime() - RECOVERY_DELAY_HOURS * 3600_000).toISOString(),
    // ...and recent enough that a reminder is still welcome.
    notBefore: new Date(now.getTime() - RECOVERY_MAX_AGE_HOURS * 3600_000).toISOString(),
  };
}

/**
 * Abandoned, never contacted, inside the window.
 *
 * `recovery_email_sent_at is null` is the idempotency key: the job stamps it
 * on send, so a re-run, an overlapping run, or a retry cannot mail the same
 * person twice. That mattered enough to be a database column rather than
 * application state.
 */
export async function selectRecoveryCandidates(
  admin: SupabaseClient,
  now: Date = new Date(),
): Promise<RecoveryCandidate[]> {
  const { notAfter, notBefore } = recoveryWindow(now);
  const { data, error } = await admin
    .from("saas_marketing_signups")
    .select("id, email, name, business_name, audience, subdomain_wanted, created_at")
    .is("provisioned_tenant_id", null)
    .is("recovery_email_sent_at", null)
    .lte("created_at", notAfter)
    .gte("created_at", notBefore)
    .order("created_at", { ascending: true })
    .limit(RECOVERY_BATCH_SIZE);

  if (error) throw error;
  return (data ?? []) as RecoveryCandidate[];
}
