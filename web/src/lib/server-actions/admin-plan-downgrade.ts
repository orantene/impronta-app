"use server";

// ============================================================================
// admin-plan-downgrade.ts — plan-tier downgrade preflight + archive flow
// ============================================================================
//
// User's stated business rule (Oran 2026-05-07): downgrading from Agency
// to Free with 27 talent must NOT silently truncate or destroy data.
// The owner picks which roster rows stay visible (within the new plan's
// cap) and the rest archive into 'archived_for_downgrade' — a new state
// added by migration 20260907140000_plan_tier_archive.sql.
//
// Three actions in this file:
//
//   getDowngradePreflight(target_tier)
//     Compares current usage against the target plan's caps. Returns the
//     overflow counts + the candidate set the UI displays for selection.
//
//   commitPlanDowngrade(target_tier, talent_keep_ids[])
//     Atomic flow: stamp a single archived_for_downgrade_event UUID,
//     archive every roster row NOT in the keep list, then update the
//     agency's plan_tier. Wrapped in a single transaction.
//
//   restoreFromDowngradeEvent(event_id?)
//     Inverse — flip 'archived_for_downgrade' rows back to 'active' and
//     clear the archive columns. Pass an event_id to restore a single
//     downgrade batch; omit to restore everything ever archived for
//     this tenant. Used on plan UPGRADE.
//
// NOTE: this file ships the data layer. The owner-facing preflight
// modal (showing 27 → "select 5 to keep") is a UI piece for next
// session. With these actions in place, that modal becomes a
// straight-through fetch + select + commit form.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { pgUuidSchema } from "@/lib/site-admin/validators";

const PLAN_TIER = z.enum(["free", "studio", "agency", "network"]);

// ─── 1. Preflight: what does this downgrade affect? ──────────────────────────

export type DowngradePreflight = {
  current_plan: "free" | "studio" | "agency" | "network";
  target_plan: "free" | "studio" | "agency" | "network";
  talent: {
    current_count: number;
    target_cap: number;
    overflow: number;
    /** Active roster rows the owner can pick from to keep visible.
     *  Always includes ALL active rows; the owner selects up to target_cap. */
    candidates: Array<{
      talent_profile_id: string;
      display_name: string | null;
      added_at: string | null;
      is_pinned_recent_inquiry: boolean;
    }>;
  };
  team: {
    current_count: number;
    target_cap: number;
    overflow: number;
  };
  feature_loss: string[]; // e.g. ["custom_domain", "api_access"]
};

const preflightSchema = z.object({
  target_tier: PLAN_TIER,
});

export async function getDowngradePreflight(input: {
  target_tier: "free" | "studio" | "agency" | "network";
}): Promise<{ ok: true; preflight: DowngradePreflight } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = preflightSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const targetTier = parsed.data.target_tier;

  // Current tenant info (plan + feature flags it currently has).
  const { data: agency, error: agencyErr } = await supabase
    .from("agencies")
    .select("plan_tier")
    .eq("id", tenantId)
    .single();
  if (agencyErr || !agency) {
    logServerError("admin-plan-downgrade.preflight.agency", agencyErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const currentPlan = agency.plan_tier as DowngradePreflight["current_plan"];

  // Caps for current + target plans.
  const { data: caps } = await supabase
    .from("plan_tier_caps")
    .select("plan_tier, talent_seats, team_seats, custom_domain, embed_widgets, api_access, exclusivity_eligible")
    .in("plan_tier", [currentPlan, targetTier]);
  if (!caps || caps.length < 2) {
    return { ok: false, error: "Plan caps not available." };
  }
  const currentCaps = caps.find((c) => c.plan_tier === currentPlan)!;
  const targetCaps = caps.find((c) => c.plan_tier === targetTier)!;

  // Active roster + team counts.
  const { data: activeRoster } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id, created_at, talent_profiles!talent_profile_id ( display_name )")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: false });
  const activeRows = activeRoster ?? [];

  const { count: teamCount } = await supabase
    .from("agency_memberships")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active");

  // Feature loss diff.
  const featureLoss: string[] = [];
  if (currentCaps.custom_domain && !targetCaps.custom_domain) featureLoss.push("custom_domain");
  if (currentCaps.embed_widgets && !targetCaps.embed_widgets) featureLoss.push("embed_widgets");
  if (currentCaps.api_access && !targetCaps.api_access) featureLoss.push("api_access");
  if (currentCaps.exclusivity_eligible && !targetCaps.exclusivity_eligible) featureLoss.push("exclusivity_eligible");

  const candidates: DowngradePreflight["talent"]["candidates"] = activeRows.map((row) => {
    const profile = (row as unknown as { talent_profiles: { display_name: string | null } | { display_name: string | null }[] | null }).talent_profiles;
    const profObj = Array.isArray(profile) ? profile[0] : profile;
    return {
      talent_profile_id: row.talent_profile_id,
      display_name: profObj?.display_name ?? null,
      added_at: row.created_at,
      // Reserved for future heuristic: roster rows recently active in
      // open inquiries should be suggested first. Stub for now.
      is_pinned_recent_inquiry: false,
    };
  });

  const preflight: DowngradePreflight = {
    current_plan: currentPlan,
    target_plan: targetTier,
    talent: {
      current_count: activeRows.length,
      target_cap: targetCaps.talent_seats,
      overflow: Math.max(0, activeRows.length - targetCaps.talent_seats),
      candidates,
    },
    team: {
      current_count: teamCount ?? 0,
      target_cap: targetCaps.team_seats,
      overflow: Math.max(0, (teamCount ?? 0) - targetCaps.team_seats),
    },
    feature_loss: featureLoss,
  };

  return { ok: true, preflight };
}

// ─── 2. Commit downgrade: archive overflow + update plan_tier ────────────────

const commitSchema = z.object({
  target_tier: PLAN_TIER,
  /** Talent profile ids the owner WANTS to keep visible. Must be ≤ the
   *  target plan's talent cap. Anything not in this list will be
   *  archived. */
  talent_keep_ids: z.array(pgUuidSchema()),
});

export type CommitDowngradeResult =
  | {
      ok: true;
      archived_count: number;
      archive_event_id: string;
      new_plan: "free" | "studio" | "agency" | "network";
    }
  | { ok: false; error: string };

export async function commitPlanDowngrade(input: {
  target_tier: "free" | "studio" | "agency" | "network";
  talent_keep_ids: string[];
}): Promise<CommitDowngradeResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const v = parsed.data;

  // Re-validate against caps server-side (don't trust client).
  const { data: caps } = await supabase
    .from("plan_tier_caps")
    .select("talent_seats")
    .eq("plan_tier", v.target_tier)
    .single();
  if (!caps) return { ok: false, error: "Plan caps not available." };
  if (v.talent_keep_ids.length > caps.talent_seats) {
    return {
      ok: false,
      error: `${v.target_tier} plan allows up to ${caps.talent_seats} talent. You selected ${v.talent_keep_ids.length}.`,
    };
  }

  // Generate the archive event id (groups all rows archived in this commit).
  // Node 19+ ships crypto.randomUUID; this server action runs on Node 22+
  // per package.json engines.
  const eventId = crypto.randomUUID();

  // Archive every active row NOT in keep list.
  const now = new Date().toISOString();
  const { error: archiveErr, count: archivedCount } = await supabase
    .from("agency_talent_roster")
    .update(
      {
        status: "archived_for_downgrade",
        archived_for_downgrade_at: now,
        archived_for_downgrade_by: user.id,
        archived_for_downgrade_event: eventId,
      },
      { count: "exact" },
    )
    .eq("tenant_id", tenantId)
    .in("status", ["active", "pending"])
    .not("talent_profile_id", "in", `(${v.talent_keep_ids.length === 0 ? "''" : v.talent_keep_ids.map((id) => `"${id}"`).join(",")})`);

  if (archiveErr) {
    logServerError("admin-plan-downgrade.commit.archive", archiveErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Flip the plan tier.
  const { error: planErr } = await supabase
    .from("agencies")
    .update({ plan_tier: v.target_tier, updated_at: now })
    .eq("id", tenantId);
  if (planErr) {
    logServerError("admin-plan-downgrade.commit.plan", planErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath("/", "layout");
  return {
    ok: true,
    archived_count: archivedCount ?? 0,
    archive_event_id: eventId,
    new_plan: v.target_tier,
  };
}

// ─── 3. Restore on upgrade ───────────────────────────────────────────────────

const restoreSchema = z.object({
  /** When set, only restore rows from this specific archive event.
   *  When omitted, restore everything currently archived for this
   *  tenant — used when the agency upgrades back to a tier that
   *  comfortably fits the entire archive. */
  event_id: pgUuidSchema().optional(),
});

export async function restoreFromDowngradeArchive(
  input: { event_id?: string } = {},
): Promise<{ ok: true; restored_count: number } | { ok: false; error: string }> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const eventId = parsed.data.event_id;

  let query = supabase
    .from("agency_talent_roster")
    .update(
      {
        status: "active",
        archived_for_downgrade_at: null,
        archived_for_downgrade_by: null,
        archived_for_downgrade_event: null,
      },
      { count: "exact" },
    )
    .eq("tenant_id", tenantId)
    .eq("status", "archived_for_downgrade");
  if (eventId) {
    query = query.eq("archived_for_downgrade_event", eventId);
  }

  const { error, count } = await query;
  if (error) {
    logServerError("admin-plan-downgrade.restore", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  revalidatePath("/", "layout");
  return { ok: true, restored_count: count ?? 0 };
}
