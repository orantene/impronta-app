/**
 * client-trust/evaluator.ts
 *
 * Derives a client's trust level from raw signals:
 *   verified_at     → basic → verified (email / identity verified)
 *   funded_balance  → verified → silver / gold (prepaid balance thresholds)
 *   manual_override → beats all auto-evaluation when set
 *
 * Thresholds live here for now; Phase 8 will expose them via a
 * platform-config table so super_admin can adjust them without deploys.
 *
 * This module is server-only (it imports Supabase server client).
 * For UI rendering use the trust-badge component directly with a
 * `ClientTrustLevel` literal.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ClientTrustLevel = "basic" | "verified" | "silver" | "gold";

export type ClientTrustState = {
  userId: string;
  tenantId: string;
  trustLevel: ClientTrustLevel;
  verifiedAt: string | null;
  fundedBalanceCents: number;
  manualOverride: ClientTrustLevel | null;
  evaluatedAt: string;
};

// ─── Thresholds ───────────────────────────────────────────────────────────────

/** Minimum funded balance (in cents) to qualify for Silver tier. */
const SILVER_THRESHOLD_CENTS = 10_000; // $100

/** Minimum funded balance (in cents) to qualify for Gold tier. */
const GOLD_THRESHOLD_CENTS = 50_000;   // $500

// ─── Core evaluator ──────────────────────────────────────────────────────────

/**
 * Derive trust level from raw signals. Pure function — no DB calls.
 * Applied by the application evaluator and written back to `client_trust_state`.
 */
export function deriveClientTrustLevel(signals: {
  verifiedAt: string | null;
  fundedBalanceCents: number;
  manualOverride: ClientTrustLevel | null;
}): ClientTrustLevel {
  // Manual override beats everything
  if (signals.manualOverride) return signals.manualOverride;

  const isVerified = !!signals.verifiedAt;
  const balance = signals.fundedBalanceCents;

  if (!isVerified) return "basic";

  // Verified → check funded balance tier
  if (balance >= GOLD_THRESHOLD_CENTS) return "gold";
  if (balance >= SILVER_THRESHOLD_CENTS) return "silver";
  return "verified";
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Load the trust state for a single (userId, tenantId) pair.
 * Returns null when the row doesn't exist yet (client has no trust record).
 * In that case the client's effective trust level is "basic".
 */
export async function loadClientTrustState(
  userId: string,
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<ClientTrustState | null> {
  try {
    const sb = supabase ?? (await createSupabaseServerClient());
    if (!sb) return null;

    const { data, error } = await sb
      .from("client_trust_state")
      .select("user_id, tenant_id, trust_level, verified_at, funded_balance_cents, manual_override, evaluated_at")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      logServerError("client-trust.loadState", error);
      return null;
    }
    if (!data) return null;

    type Row = {
      user_id: string;
      tenant_id: string;
      trust_level: ClientTrustLevel;
      verified_at: string | null;
      funded_balance_cents: number;
      manual_override: ClientTrustLevel | null;
      evaluated_at: string;
    };
    const row = data as unknown as Row;
    return {
      userId: row.user_id,
      tenantId: row.tenant_id,
      trustLevel: row.trust_level,
      verifiedAt: row.verified_at,
      fundedBalanceCents: row.funded_balance_cents,
      manualOverride: row.manual_override,
      evaluatedAt: row.evaluated_at,
    };
  } catch (err) {
    logServerError("client-trust.loadState", err);
    return null;
  }
}

/**
 * Load trust states for a batch of user IDs within a tenant.
 * Returns a Map keyed by userId. Users with no record default to "basic".
 */
export async function loadClientTrustStatesForTenant(
  userIds: string[],
  tenantId: string,
  supabase?: SupabaseClient,
): Promise<Map<string, ClientTrustLevel>> {
  const out = new Map<string, ClientTrustLevel>();
  if (userIds.length === 0) return out;

  try {
    const sb = supabase ?? (await createSupabaseServerClient());
    if (!sb) return out;

    const { data, error } = await sb
      .from("client_trust_state")
      .select("user_id, trust_level")
      .in("user_id", userIds)
      .eq("tenant_id", tenantId);

    if (error) {
      logServerError("client-trust.loadStatesForTenant", error);
      return out;
    }

    type Row = { user_id: string; trust_level: ClientTrustLevel };
    for (const row of (data ?? []) as unknown as Row[]) {
      out.set(row.user_id, row.trust_level);
    }
  } catch (err) {
    logServerError("client-trust.loadStatesForTenant", err);
  }

  return out;
}

/**
 * Upsert the evaluated trust level for a (userId, tenantId) pair.
 * Used by the server action that re-evaluates trust after signals change.
 */
export async function writeClientTrustLevel(
  userId: string,
  tenantId: string,
  signals: {
    verifiedAt: string | null;
    fundedBalanceCents: number;
    manualOverride: ClientTrustLevel | null;
  },
  supabase?: SupabaseClient,
): Promise<{ trustLevel: ClientTrustLevel } | null> {
  try {
    const sb = supabase ?? (await createSupabaseServerClient());
    if (!sb) return null;

    const trustLevel = deriveClientTrustLevel(signals);

    const { error } = await sb.from("client_trust_state").upsert(
      {
        user_id: userId,
        tenant_id: tenantId,
        trust_level: trustLevel,
        verified_at: signals.verifiedAt,
        funded_balance_cents: signals.fundedBalanceCents,
        manual_override: signals.manualOverride,
        evaluated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,tenant_id" },
    );

    if (error) {
      logServerError("client-trust.writeLevel", error);
      return null;
    }

    return { trustLevel };
  } catch (err) {
    logServerError("client-trust.writeLevel", err);
    return null;
  }
}
