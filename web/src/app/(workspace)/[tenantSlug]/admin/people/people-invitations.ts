import "server-only";

/**
 * people-invitations.ts — which email addresses this workspace is waiting on.
 *
 * WHY THIS READ EXISTS. Inviting someone writes a `team_invite_tokens` row and
 * NO membership: the membership is created at redemption time, by
 * `/team-invite/[id]`, and only for a signed-in account whose email matches the
 * invited address. So a surface that reads only `agency_memberships` cannot see
 * an invitation at all, and reports "no access" for a person it invited a
 * minute ago — the same empty box, after a successful send.
 *
 * THE MATCH IS THE REDEMPTION RULE, NOT A NEW ONE. `/team-invite/[id]` refuses
 * to redeem a token that is redeemed, revoked or past `expires_at`, and refuses
 * to redeem at all unless `session.user.email` equals `invited_email`. So an
 * invitation belongs to the person whose email it names, and only while it is
 * still redeemable. `pendingInvitationEmails` below is that same set of
 * conditions in one pure function the guards can run: the read hands it rows
 * and decides nothing itself, so the rule cannot drift into a WHERE clause
 * nothing exercises.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/** One `team_invite_tokens` row, as narrow as this module needs it. */
export type InvitationTokenRow = {
  readonly invited_email: string | null;
  readonly redeemed_at: string | null;
  readonly revoked_at: string | null;
  readonly expires_at: string | null;
};

/**
 * The lower-cased emails these tokens mean this workspace is STILL waiting on,
 * as of `now`.
 *
 * Live means all three of unredeemed, unrevoked and unexpired — exactly what
 * the redemption route will still honour. A redeemed token is a membership by
 * now and shows up on the membership side; a revoked or expired one grants
 * nothing and must not read as "waiting for them", which is a state an operator
 * would sit on instead of re-inviting. A row with no readable expiry is not
 * treated as eternal: it cannot be shown to be live, so it is not.
 */
export function pendingInvitationEmails(
  rows: readonly InvitationTokenRow[],
  now: Date,
): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (row.redeemed_at !== null) continue;
    if (row.revoked_at !== null) continue;
    const expiry = row.expires_at === null ? Number.NaN : Date.parse(row.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now.getTime()) continue;
    const email = row.invited_email?.trim().toLowerCase();
    if (email) out.add(email);
  }
  return out;
}

/**
 * Every live invitation this tenant has out.
 *
 * An empty set on failure, so a broken read never invents a pending invitation
 * that would hide the invite control from the one person who needs it.
 */
export async function loadPendingInvitationEmails(
  client: SupabaseClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<ReadonlySet<string>> {
  const { data, error } = await client
    .from("team_invite_tokens")
    .select("invited_email, redeemed_at, revoked_at, expires_at")
    .eq("tenant_id", tenantId);
  if (error) {
    logServerError("people.load.invitations", error);
    return new Set<string>();
  }
  return pendingInvitationEmails(data ?? [], now);
}

/** Is this workspace waiting on this person to accept? A `null` email never is. */
export function hasPendingInvitationFor(
  email: string | null,
  pending: ReadonlySet<string>,
): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return pending.has(normalized);
}
