import "server-only";
import type Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadAccountPlatform } from "./account-platform";
import { getStripeFor, type StripeAccountKey } from "./client";
import { PAYOUT_RECONNECT_REQUIRED } from "@/lib/payments/connect-account-setup";

/**
 * TUL-1788: every Connect call for an EXISTING connected account must use the
 * Stripe client of the platform the account lives on. The stored
 * `stripe_account_platform` is tolerant (defaults to 'us'), so a row whose
 * column is unset/stale while the account really lives on the MX platform made
 * accountSessions/accountLinks fail with account_invalid on the US key. This
 * resolver probes the stored platform first and, only on a "no such account"
 * answer, the other configured platform, then heals the column. If neither
 * platform knows the account it returns `reconnect` (never auto-deletes).
 */

export type OwningClientResult =
  | { ok: true; stripe: Stripe; platform: StripeAccountKey; healed: boolean }
  | { ok: false; reason: "reconnect" | "unconfigured"; error: string };

export function isStaleAccountError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "resource_missing" || code === "account_invalid";
}

export type OwningClientDeps = {
  storedPlatform: StripeAccountKey;
  accountId: string;
  getClient: (key: StripeAccountKey) => Stripe | null;
  persistPlatform: (key: StripeAccountKey) => Promise<void>;
};

export async function resolveOwningClient(deps: OwningClientDeps): Promise<OwningClientResult> {
  const { storedPlatform, accountId, getClient, persistPlatform } = deps;
  const primary = getClient(storedPlatform);
  if (!primary) {
    return { ok: false, reason: "unconfigured", error: "Stripe is not configured." };
  }
  try {
    await primary.accounts.retrieve(accountId);
    return { ok: true, stripe: primary, platform: storedPlatform, healed: false };
  } catch (err) {
    if (!isStaleAccountError(err)) {
      // Network / auth / rate-limit: not an ownership answer. Let the real call surface it.
      return { ok: true, stripe: primary, platform: storedPlatform, healed: false };
    }
  }
  const otherKey: StripeAccountKey = storedPlatform === "mx" ? "us" : "mx";
  const other = getClient(otherKey);
  if (other) {
    try {
      await other.accounts.retrieve(accountId);
      await persistPlatform(otherKey);
      return { ok: true, stripe: other, platform: otherKey, healed: true };
    } catch (err) {
      if (!isStaleAccountError(err)) {
        return { ok: true, stripe: primary, platform: storedPlatform, healed: false };
      }
    }
  }
  return { ok: false, reason: "reconnect", error: PAYOUT_RECONNECT_REQUIRED };
}

export async function resolveConnectedAccountClient(
  table: "talent_profiles" | "agencies",
  match: { column: "id" | "slug"; value: string },
  accountId: string,
): Promise<OwningClientResult> {
  const storedPlatform = await loadAccountPlatform(table, match);
  return resolveOwningClient({
    storedPlatform,
    accountId,
    getClient: getStripeFor,
    persistPlatform: async (key) => {
      const admin = createServiceRoleClient();
      if (!admin) return;
      const { error } = await admin
        .from(table)
        .update({ stripe_account_platform: key })
        .eq(match.column, match.value);
      if (error) logServerError("stripe.connected-account-client.heal", error);
    },
  });
}
