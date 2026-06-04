import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadClientTrustSummary } from "@/lib/client-integrations/client-trust-summary";
import {
  listTalentIntegrations,
  listPublicTalentIntegrationItems,
  type TalentIntegrationRow,
} from "./repository";

/**
 * Read-only "proof health" summary for the admin/coordinator surfaces.
 *
 * Aggregates, for one rostered talent, the signals a coordinator needs to gauge
 * how strong (and how fresh) the talent's verified social proof is — WITHOUT
 * exposing any secret/private content. Counts + statuses only.
 *
 * Sources (all via the staff-summary RLS data contract / service role):
 *   - verified social proof  → talent_integrations with OAuth verification
 *   - recent selected media  → talent_integration_items flagged public
 *   - client trust proof     → presence of a verified client trust summary
 *   - stale / needs-re-auth  → connections in needs_reauth OR with an expired
 *                              token (metadata_cache.token_expires_at in past)
 *
 * GAP NOTE: the talent_integrations.status enum has no `expired` value — only
 * `needs_reauth`. So "expired" is derived from metadata_cache.token_expires_at
 * when present. No flow currently writes needs_reauth (OAuth refresh is dormant),
 * so the stale signal will commonly be empty in practice; we surface what IS
 * available rather than fabricating a status.
 */

export type ProofHealthConnection = {
  provider: string;
  status: TalentIntegrationRow["status"];
  verified: boolean;
  agencyVisible: boolean;
  /** True when this connection needs re-auth or its token has expired. */
  needsAttention: boolean;
};

export type ProofHealth = {
  /** Count of OAuth-verified, connected talent connections. */
  verifiedConnectionCount: number;
  /** Total connections the agency can see (agency_visible). */
  visibleConnectionCount: number;
  /** Count of talent_integration_items flagged for the public profile. */
  selectedPublicMediaCount: number;
  /** Whether the client side of an inquiry carries a verified trust signal. */
  hasClientTrustProof: boolean;
  /** Connections needing re-auth / with an expired token. */
  needsAttentionCount: number;
  /** Per-connection rollup (no secrets). */
  connections: ProofHealthConnection[];
};

const EMPTY: ProofHealth = {
  verifiedConnectionCount: 0,
  visibleConnectionCount: 0,
  selectedPublicMediaCount: 0,
  hasClientTrustProof: false,
  needsAttentionCount: 0,
  connections: [],
};

function isVerified(row: TalentIntegrationRow): boolean {
  return (
    row.status === "connected" &&
    row.metadata_cache?.verification_status === "oauth_verified"
  );
}

/**
 * Pure staleness predicate (no IO) so it is unit-testable.
 * A connection needs attention when it is explicitly flagged `needs_reauth`, OR
 * its cached OAuth token has an expiry that is now in the past.
 */
export function connectionNeedsAttention(
  row: Pick<TalentIntegrationRow, "status" | "metadata_cache">,
  now: number = Date.now(),
): boolean {
  if (row.status === "needs_reauth" || row.status === "error") return true;
  const rawExpiry = row.metadata_cache?.token_expires_at;
  if (typeof rawExpiry === "string" && rawExpiry) {
    const expiryMs = Date.parse(rawExpiry);
    if (!Number.isNaN(expiryMs) && expiryMs < now) return true;
  }
  return false;
}

/**
 * Pure aggregator (no IO) so the rollup is unit-testable. Only connections the
 * agency may see (agency_visible) are counted in the visible/verified/attention
 * tallies, mirroring the staff-summary RLS policy.
 */
export function summarizeTalentConnections(
  rows: TalentIntegrationRow[],
  selectedPublicMediaCount: number,
  hasClientTrustProof: boolean,
  now: number = Date.now(),
): ProofHealth {
  const connections: ProofHealthConnection[] = [];
  let verifiedConnectionCount = 0;
  let visibleConnectionCount = 0;
  let needsAttentionCount = 0;

  for (const row of rows) {
    if (!row.agency_visible) continue;
    const verified = isVerified(row);
    const needsAttention = connectionNeedsAttention(row, now);
    visibleConnectionCount += 1;
    if (verified) verifiedConnectionCount += 1;
    if (needsAttention) needsAttentionCount += 1;
    connections.push({
      provider: row.provider_key,
      status: row.status,
      verified,
      agencyVisible: row.agency_visible,
      needsAttention,
    });
  }

  return {
    verifiedConnectionCount,
    visibleConnectionCount,
    selectedPublicMediaCount,
    hasClientTrustProof,
    needsAttentionCount,
    connections,
  };
}

/**
 * Load the proof-health summary for a rostered talent. Caller must already be
 * staff-of-tenant for `tenantId`. Never throws; returns an EMPTY summary on any
 * read failure so the card degrades gracefully.
 *
 * `clientUserId` is optional context (e.g. a specific inquiry's client) used
 * only to surface whether client-side trust proof exists; it never exposes
 * client-private data.
 */
export async function loadTalentProofHealth(input: {
  talentProfileId: string;
  tenantId: string;
  clientUserId?: string | null;
}): Promise<ProofHealth> {
  const supabase = createServiceRoleClient();
  if (!supabase) return EMPTY;

  try {
    const [connections, publicItems] = await Promise.all([
      listTalentIntegrations(input.talentProfileId),
      listPublicTalentIntegrationItems(input.talentProfileId),
    ]);

    let hasClientTrustProof = false;
    if (input.clientUserId) {
      const clientSummary = await loadClientTrustSummary({
        userId: input.clientUserId,
        tenantId: input.tenantId,
        audience: "staff",
      });
      hasClientTrustProof = clientSummary.verified;
    }

    return summarizeTalentConnections(
      connections,
      publicItems.length,
      hasClientTrustProof,
    );
  } catch {
    return EMPTY;
  }
}
