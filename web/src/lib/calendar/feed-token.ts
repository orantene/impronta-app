import "server-only";

/**
 * feed-token.ts — mint, resolve and revoke the calendar subscription credential.
 *
 * The token is a random 32-byte secret rendered base64url. Only its SHA-256
 * reaches the database, so a dump of `calendar_feed_tokens` is not a set of
 * working subscription URLs.
 *
 * NO HMAC AND NO PEPPER ON THE HASH, and that is a deliberate departure from
 * how this repo hashes most things. A pepper protects a LOW-ENTROPY secret from
 * offline brute force; 256 bits of `randomBytes` has nothing to protect. What a
 * pepper would add is a second failure mode — rotate or lose the env var and
 * every operator's calendar silently stops resolving, with the row still
 * sitting there looking valid.
 *
 * LOOKUP IS BY HASH EQUALITY, not by a scan-and-compare. There is no timing
 * side channel to defend here because there is no comparison in application
 * code at all: the index either finds the row or does not, and a caller cannot
 * learn a 256-bit secret one byte at a time from a Postgres index probe.
 */

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/** Long enough that a guess is not a strategy, short enough to fit a URL bar. */
const TOKEN_BYTES = 32;

export function hashFeedToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export type MintedFeedToken = {
  /** Returned exactly once. Nothing can read it back afterwards. */
  token: string;
  createdAt: string;
};

type Admin = SupabaseClient<never, never, never>;

/**
 * Mint a subscription token for one operator on one workspace, replacing
 * whatever they had.
 *
 * ROTATION IS THE ONLY WRITE PATH. There is no "get my existing URL": the
 * plaintext is not recoverable, so the honest answer to "show me my URL again"
 * is a new one, and the old subscription stops resolving the moment it is
 * issued. That is stated on the drawer rather than discovered from a phone that
 * quietly stopped updating.
 *
 * The revoke and the insert are two statements, not one transaction, because
 * PostgREST gives no transaction across calls. The order is chosen so the
 * failure mode is safe: revoke first, then insert. A crash between them leaves
 * the operator with NO working feed (visible, fixable by pressing the button
 * again) rather than with two (invisible, and one of them is the URL they
 * thought they had just killed).
 */
export async function mintCalendarFeedToken(
  admin: Admin,
  args: { tenantId: string; userId: string },
): Promise<MintedFeedToken | null> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const nowIso = new Date().toISOString();

  const revoked = await admin
    .from("calendar_feed_tokens")
    .update({ revoked_at: nowIso })
    .eq("tenant_id", args.tenantId)
    .eq("user_id", args.userId)
    .is("revoked_at", null);
  if (revoked.error) {
    logServerError("calendar/mintFeedToken.revoke", revoked.error);
    return null;
  }

  const inserted = await admin
    .from("calendar_feed_tokens")
    .insert({
      tenant_id: args.tenantId,
      user_id: args.userId,
      token_hash: hashFeedToken(token),
    })
    .select("created_at")
    .single();
  if (inserted.error || !inserted.data) {
    logServerError("calendar/mintFeedToken.insert", inserted.error);
    return null;
  }

  return {
    token,
    createdAt: (inserted.data as { created_at: string }).created_at,
  };
}

export type ResolvedFeedToken = {
  tenantId: string;
  userId: string;
};

/**
 * Resolve a token from the URL to the workspace whose calendar it opens.
 *
 * A revoked row resolves to `null` exactly like an unknown one. The route
 * answers 404 either way: telling a caller "this token existed and was
 * revoked" is telling them their guess landed on a real workspace.
 */
export async function resolveCalendarFeedToken(
  admin: Admin,
  token: string,
): Promise<ResolvedFeedToken | null> {
  const trimmed = token?.trim() ?? "";
  if (!trimmed) return null;
  const { data, error } = await admin
    .from("calendar_feed_tokens")
    .select("tenant_id, user_id, revoked_at")
    .eq("token_hash", hashFeedToken(trimmed))
    .maybeSingle();
  if (error) {
    logServerError("calendar/resolveFeedToken", error);
    return null;
  }
  const row = data as
    | { tenant_id: string; user_id: string; revoked_at: string | null }
    | null;
  if (!row || row.revoked_at) return null;
  return { tenantId: row.tenant_id, userId: row.user_id };
}

/**
 * Stamp a successful poll, best-effort and never awaited for correctness.
 *
 * A write failure here must not fail the fetch: the calendar is served, and the
 * only thing lost is a "last polled" hint on a settings screen. Making the feed
 * depend on this write would turn a metadata problem into an operator whose
 * calendar went blank.
 */
export async function touchCalendarFeedToken(
  admin: Admin,
  token: string,
): Promise<void> {
  try {
    await admin
      .from("calendar_feed_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_hash", hashFeedToken(token));
  } catch (error) {
    logServerError("calendar/touchFeedToken", error);
  }
}

/** Kill an operator's subscription without issuing a replacement. */
export async function revokeCalendarFeedTokens(
  admin: Admin,
  args: { tenantId: string; userId: string },
): Promise<boolean> {
  const { error } = await admin
    .from("calendar_feed_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("tenant_id", args.tenantId)
    .eq("user_id", args.userId)
    .is("revoked_at", null);
  if (error) {
    logServerError("calendar/revokeFeedTokens", error);
    return false;
  }
  return true;
}
