import "server-only";

/**
 * media-release-withdraw.ts — the OPEN-ASK ledger: who is already waiting, and
 * how a talent takes their own ask back (execution-plan-2026-08-15 §3 B11).
 *
 * Two things that look unrelated live together on purpose: both answer "is
 * there already a pending request for this photo, and whose is it?".
 * `loadPendingReleaseAssetIds` is the server-side duplicate guard the request
 * path was missing; `withdrawMediaReleaseRequest` is the only writer of the
 * `'cancelled'` status. Keeping them in one module means the definition of "an
 * open ask" cannot drift between the code that refuses a second one and the
 * code that ends the first.
 *
 * Split out of `media-release-requests.ts` rather than appended to it because
 * that file sits at the 800-line lint cap. Imports ONLY `media-grants-shared`
 * (never `media-grants.ts` or `media-release-requests.ts`) so there is no
 * module cycle — a cycle here is a TDZ crash at chunk-eval time that no gate in
 * this repo catches. `media-grants.ts` re-exports everything below.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import {
  isMediaReleaseRequest,
  logGrantActivity,
  notifyWorkspaceStaff,
  parseReleaseScopes,
  type MediaGrantResult,
} from "./media-grants-shared";

/**
 * Asset ids this talent already has an OPEN ask about, for one owner and one
 * target. Scoped by target on purpose: "anywhere" and "on hub B" are different
 * asks about the same photo, and only the identical pair is a duplicate.
 *
 * FAILS OPEN. If the read errors we return an empty set, i.e. the ask goes
 * through. A transient Supabase blip must not present to a talent as "you
 * already asked" for something they did not.
 */
export async function loadPendingReleaseAssetIds(
  admin: SupabaseClient,
  input: { talentProfileId: string; ownerTenantId: string; targetTenantId: string | null },
): Promise<Set<string>> {
  const out = new Set<string>();
  const { data, error } = await admin
    .from("talent_agency_permission_requests")
    .select("requested_scopes")
    .eq("talent_profile_id", input.talentProfileId)
    .eq("requesting_tenant_id", input.ownerTenantId)
    .eq("status", "pending")
    .limit(200);
  if (error) {
    logServerError("media-grants.loadPendingForDuplicate", error);
    return out;
  }
  for (const row of (data ?? []) as Array<{ requested_scopes: string[] | null }>) {
    if (!isMediaReleaseRequest(row.requested_scopes)) continue;
    const scopes = parseReleaseScopes(row.requested_scopes);
    if (scopes.targetTenantId !== input.targetTenantId) continue;
    for (const id of scopes.assetIds) out.add(id);
  }
  return out;
}

export type ReleaseWithdrawOutcome = {
  requestId: string;
  assetCount: number;
  ownerTenantId: string;
  targetTenantId: string | null;
  notified: number;
};

/**
 * The talent takes their own ask back (B11).
 *
 * `'cancelled'` has been in the status check constraint since the consent table
 * was created and had never been written by anything, so an ask a talent
 * regretted could only be ended by the workspace declining it. That left the
 * talent looking like they were still waiting on an answer they no longer
 * wanted, and left a card in the workspace queue nobody needed to decide.
 *
 * THE SUBJECT KEY GOES WITH IT. The ask IS the subject's consent — it writes a
 * `subject` grant at request time. Cancelling the request without revoking that
 * grant would leave the consent standing after the person withdrew it, so an
 * owner-side grant written later by any other path would make the photo travel
 * on a key its subject had taken back. Withdrawing revokes both.
 *
 * The security boundary is the `talent_profile_id` equality below: a talent can
 * only ever withdraw their OWN request, and only while it is still pending.
 */
export async function withdrawMediaReleaseRequest(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    talentName: string;
    requestId: string;
    actorUserId: string;
  },
): Promise<MediaGrantResult<ReleaseWithdrawOutcome>> {
  const { data, error } = await admin
    .from("talent_agency_permission_requests")
    .select("id, requesting_tenant_id, requested_scopes")
    .eq("id", input.requestId)
    .eq("talent_profile_id", input.talentProfileId)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !data) return { ok: false, error: "That request is no longer open." };

  const row = data as {
    id: string;
    requesting_tenant_id: string;
    requested_scopes: string[] | null;
  };
  if (!isMediaReleaseRequest(row.requested_scopes)) {
    return { ok: false, error: "That request is not a photo release." };
  }
  const { assetIds, targetTenantId } = parseReleaseScopes(row.requested_scopes);

  const { error: updateErr } = await admin
    .from("talent_agency_permission_requests")
    .update({
      status: "cancelled",
      responded_at: new Date().toISOString(),
      responded_by_user_id: input.actorUserId,
    })
    .eq("id", row.id)
    .eq("talent_profile_id", input.talentProfileId)
    .eq("status", "pending");

  if (updateErr) {
    logServerError("media-grants.withdraw", updateErr);
    return { ok: false, error: "Could not withdraw the request. Try again." };
  }

  const { error: grantErr } = await admin
    .from("media_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("source_request_id", row.id)
    .eq("grant_kind", "subject")
    .is("revoked_at", null);
  if (grantErr) logServerError("media-grants.withdrawSubjectKey", grantErr);

  await logGrantActivity(admin, row.requesting_tenant_id, assetIds, "grant.release_withdrawn", {
    request_id: row.id,
    target_tenant_id: targetTenantId,
    talent_profile_id: input.talentProfileId,
    actor_user_id: input.actorUserId,
  });

  const count = assetIds.length;
  const notified = await notifyWorkspaceStaff(admin, {
    tenantId: row.requesting_tenant_id,
    actorUserId: input.actorUserId,
    title: `${input.talentName} withdrew a photo request`,
    body: `${input.talentName} took back their request to use ${count} photo${count === 1 ? "" : "s"} you own on another site. There is nothing to decide. They can ask again later.`,
  });

  return {
    ok: true,
    data: {
      requestId: row.id,
      assetCount: count,
      ownerTenantId: row.requesting_tenant_id,
      targetTenantId,
      notified,
    },
  };
}
