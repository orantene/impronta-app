import "server-only";

/**
 * grant-predicate-client.ts — which Supabase role asks the grant predicates.
 *
 * WHY THIS EXISTS (Batch A / A2)
 * ──────────────────────────────
 * `media_assets_presentable_on_tenant` and
 * `media_assets_watermark_required_on_tenant` used to be EXECUTE-able by
 * `anon`. They are SECURITY DEFINER and join `agency_talent_roster`, so an
 * anonymous caller with two UUIDs could ask "is asset X presentable on hub Y?"
 * and read back non-public roster membership. Migration 20261117000000 revokes
 * that grant.
 *
 * The catch the audit missed: the PUBLIC directory reaches both functions with
 * an anon-key client — `createPublicSupabaseClient()` → `fetchDirectoryPage()`
 * → `resolveTalentCardThumbsForHub()`. Revoking alone would have turned every
 * predicate call into a permission error, and with A3's fail-closed stance that
 * is a blank photo on every public card.
 *
 * So the RPCs move to the service-role client. This is safe because both
 * functions are AUTH-INDEPENDENT: they read `(asset_id, tenant_id)` and touch
 * `auth.uid()` nowhere. Same inputs, same answer, only the role differs.
 *
 * ONLY THE RPCs. Ordinary table reads stay on the caller's client, where RLS is
 * doing real work. Do not widen this helper into "use service role for media".
 *
 * When the service-role key is absent (unit tests, a misconfigured env) this
 * returns the caller's client unchanged, so nothing is forced to construct a
 * client it cannot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * The client to issue a grant-predicate RPC on. Prefers service-role; falls
 * back to whatever the caller already had.
 */
export function grantPredicateClient(client: SupabaseClient): SupabaseClient {
  return createServiceRoleClient() ?? client;
}
