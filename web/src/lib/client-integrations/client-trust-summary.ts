import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getClientIntegrationDef } from "./catalog";
import {
  isClientIntegrationVerifiedTrustSignal,
  type ClientIntegrationRow,
} from "./repository";

/**
 * Minimal, read-only trust summary for a CLIENT, shown to staff/talent on
 * inquiry + booking surfaces.
 *
 * PRIVACY CONTRACT — this is deliberately tiny. It exposes ONLY:
 *   - whether the client carries a verified-trust signal,
 *   - the tenant-scoped trust level (basic/verified/silver/gold) when present,
 *   - per-provider *labels* (e.g. "Instagram") + the public account label
 *     string the client themselves chose to expose,
 * and NOTHING private: no tokens, no email, no scopes, no metadata cache, no
 * private profile content. Manual (unverified) links are excluded — only real
 * OAuth-verified ownership counts, per the no-fake-badges principle.
 *
 * Visibility gating mirrors the client_integrations RLS staff/talent policies:
 *   - staff audience requires agency_visible = true,
 *   - talent audience requires talent_visible = true.
 * Callers must already be staff-of-tenant for `tenantId` (this helper uses the
 * service role to read summary fields and re-applies the data contract; it does
 * NOT itself authorize the caller).
 */

export type ClientTrustLevel = "basic" | "verified" | "silver" | "gold";

export type ClientVerifiedAccount = {
  /** Provider key, e.g. "instagram". */
  provider: string;
  /** Human label, e.g. "Instagram". */
  label: string;
  /** The public account label the client opted to expose, if any. */
  accountLabel: string | null;
};

export type ClientTrustSummary = {
  /** True when at least one verified OAuth trust signal is present. */
  verified: boolean;
  /** Tenant-scoped trust level, when a client_trust_state row exists. */
  trustLevel: ClientTrustLevel | null;
  /** Verified provider accounts the audience is allowed to see (may be empty). */
  accounts: ClientVerifiedAccount[];
};

export type TrustSummaryAudience = "staff" | "talent";

/** Empty (render-nothing) summary. */
const EMPTY: ClientTrustSummary = {
  verified: false,
  trustLevel: null,
  accounts: [],
};

function isVisibleToAudience(
  row: ClientIntegrationRow,
  audience: TrustSummaryAudience,
): boolean {
  return audience === "talent" ? row.talent_visible : row.agency_visible;
}

/**
 * Pure selector (no IO) so the privacy contract is unit-testable: from a set of
 * client_integrations rows, keep ONLY the verified OAuth trust signals the given
 * audience is allowed to see, projected to the minimal public-safe shape.
 * Manual/unverified links and audience-hidden rows are dropped.
 */
export function selectVisibleVerifiedAccounts(
  rows: ClientIntegrationRow[],
  audience: TrustSummaryAudience,
): ClientVerifiedAccount[] {
  const accounts: ClientVerifiedAccount[] = [];
  for (const raw of rows) {
    if (!isClientIntegrationVerifiedTrustSignal(raw)) continue;
    if (!isVisibleToAudience(raw, audience)) continue;
    const def = getClientIntegrationDef(raw.provider_key);
    accounts.push({
      provider: raw.provider_key,
      label: def?.label ?? raw.provider_key,
      accountLabel: raw.provider_account_label ?? null,
    });
  }
  return accounts;
}

/**
 * Build a minimal client trust summary for one (user, tenant) pair.
 *
 * Returns {@link EMPTY} (caller should render nothing) when the user has no
 * verified trust signal the audience may see. Never throws.
 */
export async function loadClientTrustSummary(input: {
  userId: string | null | undefined;
  tenantId: string;
  audience?: TrustSummaryAudience;
}): Promise<ClientTrustSummary> {
  const userId = input.userId?.trim();
  if (!userId) return EMPTY;
  const audience: TrustSummaryAudience = input.audience ?? "staff";

  const supabase = createServiceRoleClient();
  if (!supabase) return EMPTY;

  // The (user, tenant) trust relationship must already exist — this both gates
  // the read to managed clients and gives us the tenant-scoped level. No row →
  // no summary (matches the RLS staff policy's client_trust_state requirement).
  const { data: trustState } = await supabase
    .from("client_trust_state")
    .select("trust_level")
    .eq("user_id", userId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!trustState) return EMPTY;

  const trustLevel = ((trustState as { trust_level?: string | null }).trust_level ??
    null) as ClientTrustLevel | null;

  // Pull the client's connections; keep only verified OAuth trust signals that
  // the audience is allowed to see.
  const { data: rows } = await supabase
    .from("client_integrations")
    .select("*")
    .eq("user_id", userId);

  const accounts = selectVisibleVerifiedAccounts(
    (rows ?? []) as ClientIntegrationRow[],
    audience,
  );

  // "verified" is true when a real verified signal exists. A high trust level
  // (silver/gold) earned via the funded/$5 Stripe path also reflects trust, but
  // this badge specifically attests *connection* verification, so it keys off
  // the verified accounts.
  const verified = accounts.length > 0;

  if (!verified && (trustLevel === null || trustLevel === "basic")) {
    return EMPTY;
  }

  return { verified, trustLevel, accounts };
}
