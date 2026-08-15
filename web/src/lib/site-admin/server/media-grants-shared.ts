import "server-only";

/**
 * media-grants-shared.ts — the pieces BOTH halves of the release rail need.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * `media-grants.ts` (what a photo may do) and `media-release-requests.ts`
 * (how that changes) both need these row loaders, notification helpers and
 * scope codecs. They live in a THIRD module rather than in one of the two so
 * the two never import each other: a module cycle here would be a TDZ crash
 * at chunk-eval time, which no gate in this repo catches.
 *
 * Callers should import from `media-grants.ts`, which re-exports all of this.
 *
 * The two-key rule (plan §P2) says an agency-owned photo of a talent does not
 * travel to a third hub on its own. `media_grants` is how it travels anyway,
 * with both keys turned and an audit trail instead of a WhatsApp argument
 * (plan §4 V2). This module owns every query behind that; the action wrappers
 * in `lib/server-actions/*` stay auth + audit + cache-bust only, per the
 * no-raw-`.from()`-in-server-actions ratchet.
 *
 * THE RAIL IS THE EXISTING ONE
 * ────────────────────────────
 * Requests ride `talent_agency_permission_requests` — the OAuth-style consent
 * table the schema already has (plan §2: "build on it, don't invent"). Two
 * things about the direction of travel are worth stating plainly, because the
 * table was designed for the opposite one:
 *
 *   • `requesting_tenant_id` here is the OWNING workspace — the one that must
 *     answer. That is what makes the request show up on their existing
 *     requests surface and what `idx_perm_req_tenant` indexes.
 *   • the hub the talent wants to USE the photo on rides in `requested_scopes`
 *     (see the scope helpers below), because the table has no column for it.
 *
 * BOTH KEYS, IN ORDER
 * ───────────────────
 * The talent's request IS the subject key — it is written immediately, because
 * asking to use a photo of yourself somewhere is the consent. The workspace's
 * approval is the owner key. Neither alone makes the photo presentable; the
 * SQL predicate needs both. That is the whole point of two keys.
 *
 * KIND-AGNOSTIC (M1): tenant ids are opaque here. Nothing asks whether an org
 * is an agency or a hub; `ownership_kind === 'agency'` is a MEDIA ownership
 * value, not an org kind.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { emitNotification } from "@/lib/notifications/emit";
import { logServerError } from "@/lib/server/safe-error";

export type MediaGrantResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Which surface a release targets. `null` = every hub (scope 'all_hubs'). */
export type ReleaseTarget = { tenantId: string } | { tenantId: null };

/** Cache keys the caller must bust after a write. */
export type MediaGrantBustKey = { tenantId: string; talentProfileId: string };

const SCOPE_ASSET_PREFIX = "media.release:";
const SCOPE_TARGET_PREFIX = "media.release.target:";
const SCOPE_TARGET_ALL = "all_hubs";

/** Cap per call so one click can never fan out into an unbounded write. */
export const MAX_RELEASE_ASSETS = 50;

// ─── scope encoding (pure — the unit tests pin these) ───────────────────────

/**
 * `requested_scopes` is a TEXT[] with no room for structure, so the asset ids
 * and the target hub are encoded as prefixed entries. Encode/decode live
 * together so they cannot drift apart.
 */
export function buildReleaseScopes(assetIds: readonly string[], targetTenantId: string | null): string[] {
  return [
    ...assetIds.map((id) => `${SCOPE_ASSET_PREFIX}${id}`),
    `${SCOPE_TARGET_PREFIX}${targetTenantId ?? SCOPE_TARGET_ALL}`,
  ];
}

export function parseReleaseScopes(scopes: readonly string[] | null): {
  assetIds: string[];
  targetTenantId: string | null;
} {
  const assetIds: string[] = [];
  let targetTenantId: string | null = null;
  for (const raw of scopes ?? []) {
    if (raw.startsWith(SCOPE_ASSET_PREFIX)) {
      assetIds.push(raw.slice(SCOPE_ASSET_PREFIX.length));
    } else if (raw.startsWith(SCOPE_TARGET_PREFIX)) {
      const target = raw.slice(SCOPE_TARGET_PREFIX.length);
      targetTenantId = target === SCOPE_TARGET_ALL ? null : target;
    }
  }
  return { assetIds, targetTenantId };
}

/** A release request only ever carries media scopes — never identity/rates/etc. */
export function isMediaReleaseRequest(scopes: readonly string[] | null): boolean {
  return (scopes ?? []).some((s) => s.startsWith(SCOPE_ASSET_PREFIX));
}

// ─── shared row shapes ──────────────────────────────────────────────────────

type AssetRow = {
  id: string;
  owner_talent_profile_id: string | null;
  ownership_kind: string | null;
  owner_tenant_id: string | null;
};

type GrantRow = {
  id: string;
  asset_id: string;
  grant_kind: string;
  scope: string;
  tenant_id: string | null;
};

export async function loadSubjectAssets(
  admin: SupabaseClient,
  talentProfileId: string,
  assetIds: readonly string[],
): Promise<AssetRow[]> {
  const { data, error } = await admin
    .from("media_assets")
    .select("id, owner_talent_profile_id, ownership_kind, owner_tenant_id")
    .in("id", assetIds as string[])
    // The subject predicate is the security boundary: a talent can only ever
    // ask about photos OF THEMSELVES.
    .eq("owner_talent_profile_id", talentProfileId)
    .is("deleted_at", null);
  if (error) {
    logServerError("media-grants.loadSubjectAssets", error);
    return [];
  }
  return (data ?? []) as unknown as AssetRow[];
}

export async function loadActiveGrants(
  admin: SupabaseClient,
  assetIds: readonly string[],
): Promise<GrantRow[]> {
  if (assetIds.length === 0) return [];
  const { data, error } = await admin
    .from("media_grants")
    // `expires_at` was dropped in 20261117000000 (D-7a): nothing ever wrote it,
    // no sweep enforced it, and no cache bust fired at expiry.
    .select("id, asset_id, grant_kind, scope, tenant_id")
    .in("asset_id", assetIds as string[])
    .is("revoked_at", null);
  if (error) {
    logServerError("media-grants.loadActiveGrants", error);
    return [];
  }
  return (data ?? []) as unknown as GrantRow[];
}

export async function logGrantActivity(
  admin: SupabaseClient,
  tenantId: string,
  assetIds: readonly string[],
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (assetIds.length === 0) return;
  try {
    await admin
      .from("media_asset_activity")
      .insert(assetIds.map((assetId) => ({ asset_id: assetId, tenant_id: tenantId, kind, payload })));
  } catch (err) {
    // Never block a grant on its own audit row.
    logServerError("media-grants.activity", err);
  }
}

/**
 * The talent's own display name, for the workspace-facing notification. Read
 * server-side on purpose: a client-supplied name would let a caller put words
 * in someone else's mouth inside a workspace inbox — the same reasoning as
 * `loadWorkspaceDisplayName` in the phase 1 claim tool.
 */
export async function loadTalentDisplayName(
  admin: SupabaseClient,
  talentProfileId: string,
): Promise<string> {
  const { data } = await admin
    .from("talent_profiles")
    .select("display_name")
    .eq("id", talentProfileId)
    .maybeSingle();
  const name = (data as { display_name: string | null } | null)?.display_name?.trim();
  return name && name.length > 0 ? name : "A talent";
}

export async function notifyTalentUsers(
  admin: SupabaseClient,
  input: {
    talentProfileId: string;
    tenantId: string;
    actorUserId: string | null;
    title: string;
    body: string;
  },
): Promise<number> {
  const { data, error } = await admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", input.talentProfileId)
    .not("user_id", "is", null);
  if (error) {
    logServerError("media-grants.notifyTalentLookup", error);
    return 0;
  }
  const userIds = [
    ...new Set(
      (data ?? [])
        .map((r) => (r as { user_id: string | null }).user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  await Promise.all(
    userIds.map((userId) =>
      emitNotification({
        userId,
        tenantId: input.tenantId,
        kind: "approval",
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

export async function notifyWorkspaceStaff(
  admin: SupabaseClient,
  input: { tenantId: string; actorUserId: string | null; title: string; body: string },
): Promise<number> {
  const { data, error } = await admin
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active");
  if (error) {
    logServerError("media-grants.notifyStaffLookup", error);
    return 0;
  }
  const userIds = [
    ...new Set(
      (data ?? [])
        .map((r) => (r as { profile_id: string | null }).profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  await Promise.all(
    userIds.map((userId) =>
      emitNotification({
        userId,
        tenantId: input.tenantId,
        kind: "approval",
        surface: "workspace",
        title: input.title,
        body: input.body,
        actorUserId: input.actorUserId,
        targetDrawer: "media-releases",
      }),
    ),
  );
  return userIds.length;
}

export async function loadTenantNames(
  admin: SupabaseClient,
  tenantIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (tenantIds.length === 0) return out;
  const { data } = await admin.from("agencies").select("id, name").in("id", tenantIds as string[]);
  for (const row of (data ?? []) as Array<{ id: string; name: string | null }>) {
    if (row.name) out.set(row.id, row.name);
  }
  return out;
}

/**
 * Which (tenant, talent) media caches a grant change invalidates.
 *
 * Always includes the OWNER's hub as well as the target: the owner's own
 * curation panel shows release state either way. A missed tag here is a photo
 * that stays visible after a revoke, so this errs toward busting one tag too
 * many.
 *
 * `targetTenantId === null` means scope `all_hubs`, which by the table's check
 * constraint carries NO tenant id. This function CANNOT know which hubs were
 * showing the photo — pass the extra ids in via `extraTenantIds`, resolved by
 * `resolveAllHubsBustTenantIds` (A5). Calling it with a null target and no
 * extras busts the owner alone, which is right only for a write that never
 * reached a third hub.
 */
export function bustKeysFor(
  talentProfileId: string,
  ownerTenantId: string,
  targetTenantId: string | null,
  extraTenantIds: readonly string[] = [],
): MediaGrantBustKey[] {
  const tenantIds = new Set<string>([ownerTenantId]);
  if (targetTenantId) tenantIds.add(targetTenantId);
  for (const id of extraTenantIds) if (id) tenantIds.add(id);
  return [...tenantIds].map((tenantId) => ({ tenantId, talentProfileId }));
}

/**
 * PURE — the hub ids an `all_hubs` grant change has to reach, given the two
 * sources that can be showing the photo.
 *
 * Split from the queries so the fan-out rule is testable without a database.
 * The owner hub is added by `bustKeysFor`, so it is not required here.
 */
export function mergeAffectedHubIds(
  rosterTenantIds: readonly (string | null | undefined)[],
  curationTenantIds: readonly (string | null | undefined)[],
): string[] {
  const out = new Set<string>();
  for (const id of [...rosterTenantIds, ...curationTenantIds]) {
    if (id) out.add(id);
  }
  return [...out];
}

/**
 * Which hubs could be serving these assets under an `all_hubs` grant?
 *
 * THE BUG THIS EXISTS FOR (A5). `bustKeysFor` was called with the grant's
 * `tenant_id`, which is NULL for every `all_hubs` row by check constraint. So
 * revoking an "anywhere" release busted the owner's tag and nothing else, and
 * every third hub that had been showing the photo kept serving it until its
 * cache expired on its own. The revoke reported success the whole time.
 *
 * Two sources, union:
 *   • every hub with an ACTIVE roster row for this talent — the implicit
 *     representation path, i.e. anywhere a card can render them at all;
 *   • every hub with a curation row naming one of these assets — a hub that
 *     picked the photo explicitly, including one whose roster row has since
 *     lapsed but whose cached page still shows the pick.
 *
 * Errs wide on purpose: an extra `revalidateTag` costs one cache miss, a
 * missed one is a revoked photo still on someone's site.
 */
export async function resolveAllHubsBustTenantIds(
  admin: SupabaseClient,
  input: { talentProfileId: string; assetIds: readonly string[] },
): Promise<string[]> {
  const assetIds = [...new Set(input.assetIds)];

  const [rosterRes, curatedRes, overlayRes] = await Promise.all([
    admin
      .from("agency_talent_roster")
      .select("tenant_id")
      .eq("talent_profile_id", input.talentProfileId)
      .eq("status", "active"),
    assetIds.length > 0
      ? admin.from("agency_talent_media").select("tenant_id").in("agency_media_id", assetIds)
      : Promise.resolve({ data: [], error: null }),
    assetIds.length > 0
      ? admin
          .from("agency_talent_overlays")
          .select("tenant_id")
          .in("cover_media_asset_id", assetIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // A source that failed to answer must not silently shrink the bust set — log
  // it and keep whatever the other sources found.
  if (rosterRes.error) logServerError("media-grants.bustHubs.roster", rosterRes.error);
  if (curatedRes.error) logServerError("media-grants.bustHubs.curation", curatedRes.error);
  if (overlayRes.error) logServerError("media-grants.bustHubs.overlay", overlayRes.error);

  const ids = (rows: unknown) =>
    ((rows ?? []) as Array<{ tenant_id: string | null }>).map((r) => r.tenant_id);

  return mergeAffectedHubIds(ids(rosterRes.data), [
    ...ids(curatedRes.data),
    ...ids(overlayRes.data),
  ]);
}
