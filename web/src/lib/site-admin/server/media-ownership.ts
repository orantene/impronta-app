import "server-only";

/**
 * media-ownership.ts — the workspace "claim / release" tool for legacy media.
 *
 * WHY
 * ───
 * Phase 1 of `web/docs/media-ownership-and-brand-library-plan-2026-08-10.md`
 * stamps every NEW write with a truthful owner. That leaves ~2,334 legacy rows
 * that all say `ownership_kind='talent'` because that was the column default,
 * not because anyone decided it. The plan's §9 decision №1 keeps that default
 * (retroactively handing agencies ownership of photos with no evidence would
 * poison the claim funnel) and instead gives workspaces an explicit, auditable
 * "these were our shoot" tool — with the talent told, and a 14-day objection
 * window, mirroring the exclusivity wind-down.
 *
 * Plain server module (NOT "use server"): every DB touch for the claim tool
 * lives here so the action file stays an auth + audit wrapper, matching
 * brand-library.ts and the no-untenanted-from ratchet's intent.
 *
 * SCOPE GUARANTEES (all four checked before a single row moves):
 *   1. the caller is staff of `tenantId` (the action wrapper's guard)
 *   2. every asset row carries `tenant_id = tenantId`
 *   3. its subject talent is on THIS tenant's roster and not removed
 *   4. the row is currently talent-owned (claiming never takes an asset from
 *      another workspace, and re-claiming is a no-op rather than a re-notify)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { emitNotification } from "@/lib/notifications/emit";

/** Days the talent has to object before the claim is treated as settled. */
export const MEDIA_CLAIM_OBJECTION_DAYS = 14;

export type MediaOwnershipResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type MediaClaimOutcome = {
  /** Rows whose ownership actually moved. */
  claimed: number;
  /** Rows skipped because they were not eligible (see SCOPE GUARANTEES). */
  skipped: number;
  /** Talents notified (only claimed profiles have a user to notify). */
  notified: number;
  /** ISO date the objection window closes. */
  objectionDeadline: string;
};

export type MediaReleaseOutcome = {
  released: number;
  skipped: number;
  notified: number;
};

type ClaimCandidate = {
  id: string;
  owner_talent_profile_id: string | null;
  ownership_kind: string | null;
  owner_tenant_id: string | null;
};

// ── Shared helpers ──────────────────────────────────────────────────────────

async function loadAssetsForTenant(
  admin: SupabaseClient,
  tenantId: string,
  assetIds: readonly string[],
): Promise<ClaimCandidate[]> {
  const { data, error } = await admin
    .from("media_assets")
    .select("id, owner_talent_profile_id, ownership_kind, owner_tenant_id")
    .in("id", assetIds as string[])
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);
  if (error) {
    logServerError("media-ownership.loadAssets", error);
    return [];
  }
  return (data ?? []) as unknown as ClaimCandidate[];
}

/** Subject talents of these rows that are actually on this tenant's roster. */
async function rosterTalentIds(
  admin: SupabaseClient,
  tenantId: string,
  talentIds: readonly string[],
): Promise<Set<string>> {
  if (talentIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .in("talent_profile_id", talentIds as string[])
    .neq("status", "removed");
  if (error) {
    logServerError("media-ownership.rosterTalents", error);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.talent_profile_id as string));
}

async function logOwnershipActivity(
  admin: SupabaseClient,
  tenantId: string,
  assetIds: readonly string[],
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (assetIds.length === 0) return;
  try {
    await admin.from("media_asset_activity").insert(
      assetIds.map((assetId) => ({
        asset_id: assetId,
        tenant_id: tenantId,
        kind,
        payload,
      })),
    );
  } catch (err) {
    // Never block an ownership move on its own audit row.
    logServerError("media-ownership.activity", err);
  }
}

/**
 * Notify the affected talents. Only CLAIMED profiles have an auth user; an
 * unclaimed profile has nobody to tell, which is itself the signal that the
 * workspace produced the media (and is surfaced in the tool's copy).
 */
async function notifyTalents(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    talentIds: readonly string[];
    actorUserId: string | null;
    title: string;
    body: string;
  },
): Promise<number> {
  if (input.talentIds.length === 0) return 0;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("id, user_id")
    .in("id", input.talentIds as string[])
    .not("user_id", "is", null);
  if (error) {
    logServerError("media-ownership.notifyLookup", error);
    return 0;
  }
  const userIds = [
    ...new Set(
      (data ?? [])
        .map((row) => (row as { user_id: string | null }).user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  await Promise.all(
    userIds.map((userId) =>
      emitNotification({
        userId,
        tenantId: input.tenantId,
        kind: "profile",
        surface: "talent",
        title: input.title,
        body: input.body,
        actorUserId: input.actorUserId,
        targetDrawer: "talent-media",
      }),
    ),
  );
  return userIds.length;
}

/**
 * The workspace's display name, for notification copy. Read server-side on
 * purpose: a client-supplied name would let a caller put words in another
 * workspace's mouth inside the talent's inbox.
 */
export async function loadWorkspaceDisplayName(
  admin: SupabaseClient,
  tenantId: string,
): Promise<string> {
  const { data } = await admin
    .from("agencies")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  const name = (data as { name: string | null } | null)?.name?.trim();
  return name && name.length > 0 ? name : "Your workspace";
}

// ── Claim ───────────────────────────────────────────────────────────────────

/**
 * Mark legacy talent-owned rows as workspace-owned.
 *
 * Idempotent: an asset already owned by this workspace is counted as skipped,
 * so re-running the tool never re-notifies the talent.
 */
export async function claimMediaAsWorkspaceOwned(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    workspaceName: string;
    actorUserId: string | null;
    assetIds: readonly string[];
  },
): Promise<MediaOwnershipResult<MediaClaimOutcome>> {
  const deadlineDate = new Date(
    Date.now() + MEDIA_CLAIM_OBJECTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const objectionDeadline = deadlineDate.toISOString();

  if (input.assetIds.length === 0) {
    return {
      ok: true,
      data: { claimed: 0, skipped: 0, notified: 0, objectionDeadline },
    };
  }

  const candidates = await loadAssetsForTenant(admin, input.tenantId, input.assetIds);
  const subjectIds = [
    ...new Set(
      candidates
        .map((c) => c.owner_talent_profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const onRoster = await rosterTalentIds(admin, input.tenantId, subjectIds);

  const eligible = candidates.filter(
    (c) =>
      c.ownership_kind === "talent" &&
      !!c.owner_talent_profile_id &&
      onRoster.has(c.owner_talent_profile_id),
  );
  const skipped = input.assetIds.length - eligible.length;

  if (eligible.length === 0) {
    return { ok: true, data: { claimed: 0, skipped, notified: 0, objectionDeadline } };
  }

  const eligibleIds = eligible.map((c) => c.id);
  const now = new Date().toISOString();
  const { error } = await admin
    .from("media_assets")
    .update({
      ownership_kind: "agency",
      owner_tenant_id: input.tenantId,
      updated_at: now,
    })
    .in("id", eligibleIds)
    // Re-assert every scope predicate on the WRITE itself. A predicate that
    // only ran on the read is a predicate a concurrent write can slip past.
    .eq("tenant_id", input.tenantId)
    .eq("ownership_kind", "talent")
    .is("deleted_at", null);

  if (error) {
    logServerError("media-ownership.claim", error);
    return { ok: false, error: "Could not update ownership. Try again." };
  }

  await logOwnershipActivity(admin, input.tenantId, eligibleIds, "ownership.claimed", {
    from: "talent",
    to: "agency",
    tenant_id: input.tenantId,
    actor_user_id: input.actorUserId,
    objection_deadline: objectionDeadline,
    claimed_at: now,
  });

  const affectedTalents = [
    ...new Set(
      eligible
        .map((c) => c.owner_talent_profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const deadlineLabel = deadlineDate.toISOString().slice(0, 10);
  const notified = await notifyTalents(admin, {
    tenantId: input.tenantId,
    talentIds: affectedTalents,
    actorUserId: input.actorUserId,
    title: `${input.workspaceName} marked some of your photos as theirs`,
    body: `${input.workspaceName} recorded that they produced ${eligible.length} photo${eligible.length === 1 ? "" : "s"} on your profile. They stay on your profile. If that is wrong, tell them before ${deadlineLabel} and they can undo it.`,
  });

  return {
    ok: true,
    data: { claimed: eligible.length, skipped, notified, objectionDeadline },
  };
}

// ── Release (undo a claim) ──────────────────────────────────────────────────

/**
 * Hand rows back to the talent. This is the objection path: it only touches
 * rows THIS workspace owns, so it can never strip another workspace's media.
 */
export async function releaseMediaToTalent(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    workspaceName: string;
    actorUserId: string | null;
    assetIds: readonly string[];
  },
): Promise<MediaOwnershipResult<MediaReleaseOutcome>> {
  if (input.assetIds.length === 0) {
    return { ok: true, data: { released: 0, skipped: 0, notified: 0 } };
  }

  const candidates = await loadAssetsForTenant(admin, input.tenantId, input.assetIds);
  const eligible = candidates.filter(
    (c) =>
      c.ownership_kind === "agency" &&
      c.owner_tenant_id === input.tenantId &&
      !!c.owner_talent_profile_id,
  );
  const skipped = input.assetIds.length - eligible.length;

  if (eligible.length === 0) {
    return { ok: true, data: { released: 0, skipped, notified: 0 } };
  }

  const eligibleIds = eligible.map((c) => c.id);
  const now = new Date().toISOString();
  const { error } = await admin
    .from("media_assets")
    .update({ ownership_kind: "talent", owner_tenant_id: null, updated_at: now })
    .in("id", eligibleIds)
    .eq("tenant_id", input.tenantId)
    .eq("owner_tenant_id", input.tenantId)
    .is("deleted_at", null);

  if (error) {
    logServerError("media-ownership.release", error);
    return { ok: false, error: "Could not update ownership. Try again." };
  }

  await logOwnershipActivity(admin, input.tenantId, eligibleIds, "ownership.released", {
    from: "agency",
    to: "talent",
    tenant_id: input.tenantId,
    actor_user_id: input.actorUserId,
    released_at: now,
  });

  const affectedTalents = [
    ...new Set(
      eligible
        .map((c) => c.owner_talent_profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const notified = await notifyTalents(admin, {
    tenantId: input.tenantId,
    talentIds: affectedTalents,
    actorUserId: input.actorUserId,
    title: `${input.workspaceName} gave photos back to you`,
    body: `${eligible.length} photo${eligible.length === 1 ? "" : "s"} on your profile are yours again. Nothing changed about where they appear.`,
  });

  return { ok: true, data: { released: eligible.length, skipped, notified } };
}
