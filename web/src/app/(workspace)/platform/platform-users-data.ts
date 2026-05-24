/**
 * Platform HQ · federated user/people data loader.
 *
 * Extracted from `platform-data.ts` (kept under the 800-line eslint cap).
 * Backs the Platform Users Control Center — see
 * `web/docs/platform-users-control-center-plan-2026-05-23.md` §3 (A.1–A.3).
 *
 * Server-only, service-role client. Never import from a client component.
 */

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import type { PlatformUserMembership } from "./platform-data";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Federated user/people row. Two kinds:
 *  - "human" — backed by a row in `profiles` (with an auth.users id). May or
 *    may not also have a claimed talent profile (talentProfileId set when so).
 *  - "unclaimed_talent" — backed by a row in `talent_profiles` with
 *    user_id IS NULL. Has no login / email / sign-in history.
 *
 * Claimed talent profiles are folded into their human row (kind="human",
 * talentProfileId set); they do NOT appear as separate unclaimed rows.
 */
type PlatformUserBase = {
  kind: "human" | "unclaimed_talent";
  /** human: profiles.id (= auth.users.id). unclaimed_talent: talent_profiles.id. */
  id: string;
  displayName: string;
  appRole: string | null;
  /** Set when the row has an associated talent profile (claimed or unclaimed). */
  talentProfileId: string | null;
  memberships: PlatformUserMembership[];
  /** Total active memberships (agencies + hubs). */
  tenantCount: number;
  /** Count of agency-kind memberships where role IN ('owner','admin'). */
  workspaceAdminCount: number;
  /** Count of agency-kind memberships (any role). */
  workspaceCount: number;
  /** Count of hub-kind memberships. */
  hubCount: number;
  createdAt: string;
  createdAtIso: string | null;
  /** True for unclaimed_talent always; true for human when talentProfileId is set. */
  isTalent: boolean;
  isTestAccount: boolean;
  /** Pulled from talent_profiles.published_globally; null for humans w/o a talent profile. */
  publishedGlobally: boolean | null;
  originKind: string | null;
  originWorkspaceId: string | null;
  originCreatedByUserId: string | null;
};

export type HumanUserRow = PlatformUserBase & {
  kind: "human";
  email: string;
  emailConfirmed: boolean;
  accountStatus: string | null;
  /** Formatted last-sign-in (e.g. "today", "3d ago", date). */
  lastSignInAt: string | null;
  lastSignInAtIso: string | null;
  /** Slug of the claimed talent profile, if any. */
  talentSlug: string | null;
  /** Workflow status of the claimed talent profile, if any. */
  talentWorkflowStatus: string | null;
};

export type UnclaimedTalentRow = PlatformUserBase & {
  kind: "unclaimed_talent";
  email: null;
  emailConfirmed: null;
  accountStatus: null;
  lastSignInAt: null;
  lastSignInAtIso: null;
  talentSlug: string | null;
  talentWorkflowStatus: string | null;
};

export type PlatformUserRow = HumanUserRow | UnclaimedTalentRow;

// ─── Helpers (local copy to keep this file self-contained) ────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Loader ───────────────────────────────────────────────────────────────────

type TalentRow = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  slug: string | null;
  user_id: string | null;
  workflow_status: string | null;
  published_globally: boolean | null;
  is_test_account: boolean | null;
  origin_kind: string | null;
  origin_workspace_id: string | null;
  origin_created_by_user_id: string | null;
  created_at: string | null;
};

/**
 * Federated people loader for the Platform Users Control Center.
 *
 * Returns one row per person on the platform, where "person" is either:
 *   - a human (row in `profiles`, with optional claimed talent profile), or
 *   - an unclaimed talent profile (row in `talent_profiles` with user_id = NULL).
 *
 * Dedup rule: a talent profile with user_id set is folded into its human row;
 * only unclaimed (user_id IS NULL) talent profiles appear as their own rows.
 *
 * Uses the M0.4 origin denorm columns directly (fast path) — does NOT call
 * resolveOrigin() per-row.
 */
export async function loadPlatformPeopleFederated(): Promise<PlatformUserRow[]> {
  const sb = createServiceRoleClient();
  if (!sb) return [];

  // ── 1. Fetch all humans (profiles) ────────────────────────────────────────
  const { data: profileRows, error } = await sb
    .from("profiles")
    .select(`
      id,
      display_name,
      app_role,
      account_status,
      created_at,
      is_test_account,
      origin_kind,
      origin_workspace_id,
      origin_created_by_user_id
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !profileRows) {
    logServerError("platform_users_data", error);
    return [];
  }

  // ── 2. Fetch all talent profiles ─────────────────────────────────────────
  const { data: talentRows, error: talentError } = await sb
    .from("talent_profiles")
    .select(`
      id,
      display_name,
      first_name,
      last_name,
      slug,
      user_id,
      workflow_status,
      published_globally,
      is_test_account,
      origin_kind,
      origin_workspace_id,
      origin_created_by_user_id,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(500);

  if (talentError) {
    logServerError("platform_users_data.talent_profiles", talentError);
  }

  const talents: TalentRow[] = (talentRows ?? []) as TalentRow[];

  // Index talent profiles by their claiming user_id (humans with a talent profile).
  const talentByUserId: Record<string, TalentRow> = {};
  for (const t of talents) {
    if (t.user_id) talentByUserId[t.user_id] = t;
  }

  // ── 3. Fetch auth data (humans only) ─────────────────────────────────────
  const { data: usersData } = await sb.auth.admin.listUsers({ perPage: 1000 });
  const emailById: Record<string, string> = {};
  const confirmedById: Record<string, boolean> = {};
  const lastSignInById: Record<string, string | null> = {};
  if (usersData?.users) {
    for (const u of usersData.users) {
      if (u.email) emailById[u.id] = u.email;
      confirmedById[u.id] = Boolean(u.email_confirmed_at);
      lastSignInById[u.id] = u.last_sign_in_at ?? null;
    }
  }

  // ── 4. Fetch memberships for all humans ───────────────────────────────────
  const profileIds = profileRows.map((r: { id: string }) => r.id);
  const membershipsByUser: Record<string, PlatformUserMembership[]> = {};
  if (profileIds.length > 0) {
    const { data: memberships } = await sb
      .from("agency_memberships")
      // Note: the column is `profile_id` (= auth.users.id), not `user_id`.
      .select(
        "profile_id, tenant_id, role, agencies!inner(display_name, slug, kind, plan_tier)",
      )
      .in("profile_id", profileIds)
      .eq("status", "active");

    if (memberships) {
      for (const m of memberships as Array<{
        profile_id: string;
        tenant_id: string;
        role: string | null;
        agencies: unknown;
      }>) {
        const ag = m.agencies;
        const agFirst = Array.isArray(ag) ? ag[0] : ag;
        const a = agFirst as {
          display_name?: string;
          slug?: string;
          kind?: string;
          plan_tier?: string;
        } | null;
        const entry: PlatformUserMembership = {
          tenantId: m.tenant_id,
          name: a?.display_name ?? a?.slug ?? m.tenant_id,
          slug: a?.slug ?? "",
          kind: a?.kind ?? "agency",
          plan: a?.plan_tier ?? "free",
          role: m.role ?? "viewer",
        };
        (membershipsByUser[m.profile_id] ??= []).push(entry);
      }
    }
  }

  const roleRank: Record<string, number> = {
    owner: 0, admin: 1, manager: 2, coordinator: 2, editor: 3, viewer: 4,
  };

  // ── 5. Build human rows ───────────────────────────────────────────────────
  const humanRows: HumanUserRow[] = (profileRows as Array<{
    id: string;
    display_name: string | null;
    app_role: string | null;
    account_status: string | null;
    created_at: string | null;
    is_test_account: boolean | null;
    origin_kind: string | null;
    origin_workspace_id: string | null;
    origin_created_by_user_id: string | null;
  }>).map((r) => {
    const ms = membershipsByUser[r.id] ?? [];
    const workspaceMs = ms.filter((m) => m.kind === "agency");
    const hubMs = ms.filter((m) => m.kind === "hub");
    const adminMs = workspaceMs.filter(
      (m) => m.role === "owner" || m.role === "admin",
    );
    ms.sort((a, b) => {
      const cmp = (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9);
      return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
    });
    const claimedTalent = talentByUserId[r.id] ?? null;
    return {
      kind: "human" as const,
      id: r.id,
      displayName: r.display_name ?? emailById[r.id]?.split("@")[0] ?? "Unknown",
      email: emailById[r.id] ?? "—",
      emailConfirmed: confirmedById[r.id] ?? true,
      appRole: r.app_role,
      accountStatus: r.account_status,
      talentProfileId: claimedTalent?.id ?? null,
      memberships: ms,
      tenantCount: ms.length,
      workspaceAdminCount: adminMs.length,
      workspaceCount: workspaceMs.length,
      hubCount: hubMs.length,
      createdAt: formatDate(r.created_at),
      createdAtIso: r.created_at,
      isTalent: r.app_role === "talent" || claimedTalent !== null,
      isTestAccount: Boolean(r.is_test_account),
      // Prefer the human's own origin denorm; fall back to claimed-talent
      // origin when the profile row doesn't carry it.
      publishedGlobally: claimedTalent?.published_globally ?? null,
      originKind: r.origin_kind ?? claimedTalent?.origin_kind ?? null,
      originWorkspaceId:
        r.origin_workspace_id ?? claimedTalent?.origin_workspace_id ?? null,
      originCreatedByUserId:
        r.origin_created_by_user_id
        ?? claimedTalent?.origin_created_by_user_id
        ?? null,
      lastSignInAt: formatDate(lastSignInById[r.id]),
      lastSignInAtIso: lastSignInById[r.id] ?? null,
      talentSlug: claimedTalent?.slug ?? null,
      talentWorkflowStatus: claimedTalent?.workflow_status ?? null,
    };
  });

  // ── 6. Build unclaimed-talent rows ────────────────────────────────────────
  const unclaimedRows: UnclaimedTalentRow[] = talents
    .filter((t) => !t.user_id)
    .map((t) => {
      const fullName = [t.first_name, t.last_name].filter(Boolean).join(" ").trim();
      const displayName = t.display_name ?? (fullName || t.slug || "Unnamed talent");
      return {
        kind: "unclaimed_talent" as const,
        id: t.id,
        displayName,
        appRole: "talent",
        talentProfileId: t.id,
        memberships: [],
        tenantCount: 0,
        workspaceAdminCount: 0,
        workspaceCount: 0,
        hubCount: 0,
        createdAt: formatDate(t.created_at),
        createdAtIso: t.created_at,
        isTalent: true,
        isTestAccount: Boolean(t.is_test_account),
        publishedGlobally: t.published_globally,
        originKind: t.origin_kind,
        originWorkspaceId: t.origin_workspace_id,
        originCreatedByUserId: t.origin_created_by_user_id,
        email: null,
        emailConfirmed: null,
        accountStatus: null,
        lastSignInAt: null,
        lastSignInAtIso: null,
        talentSlug: t.slug,
        talentWorkflowStatus: t.workflow_status,
      };
    });

  return [...humanRows, ...unclaimedRows];
}

/** @deprecated Use {@link loadPlatformPeopleFederated} instead. */
export async function loadPlatformUsers(): Promise<PlatformUserRow[]> {
  return loadPlatformPeopleFederated();
}
