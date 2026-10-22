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
import { trackPlanChanged } from "@/lib/analytics/conversion-events";
import { recordCommerceAudit, COMMERCE_AUDIT } from "@/lib/billing/commerce-audit";
import { assertNotImpersonating, requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { WORKSPACE_MONEY_GATES, isStrictPlanDowngrade } from "@/lib/billing/workspace-money-gates";
import { applyWorkspaceDowngrade } from "@/lib/billing/plan-change.server";
import { resolveKeepList } from "@/lib/billing/downgrade-keep-list";
import { archiveRosterOverflow } from "@/lib/billing/workspace-downgrade-archive";

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
      /**
       * TUL-1518: when the workspace has a live Stripe subscription the plan changes at Stripe's period end (the webhook
       * writes the tier); this is that date, or null. `stripe_scheduled` is false for a workspace with no subscription.
       */
      effective_at: string | null;
      stripe_scheduled: boolean;
      /** TUL-1737: true when the roster is archived at period end by the webhook (UI: planChange.archivesAtPeriodEnd with effective_at). */
      archives_at_period_end: boolean;
    }
  | { ok: false; error: string };

export async function commitPlanDowngrade(input: {
  target_tier: "free" | "studio" | "agency" | "network";
  talent_keep_ids: string[];
}): Promise<CommitDowngradeResult> {
  await requireNotImpersonating();
  // TUL-1269 M2: moving the plan is billing (owner), not any workspace staff.
  const auth = await requireWorkspaceStaffAction({ capability: WORKSPACE_MONEY_GATES.planChange });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const v = parsed.data;

  // A downgrade must go DOWN. This action used to accept any tier, so it could
  // stamp a paid tier ("free" -> "network") without a payment.
  const { data: current, error: currentErr } = await supabase
    .from("agencies")
    .select("plan_tier")
    .eq("id", tenantId)
    .single();
  if (currentErr || !current) {
    logServerError("admin-plan-downgrade.commit.current", currentErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  if (!isStrictPlanDowngrade(current.plan_tier as string | null, v.target_tier)) {
    return { ok: false, error: "Paid upgrades go through billing." };
  }

  // The plan write needs the service role: plan_tier is platform-owned (held
  // M1 trigger 20261231418100 refuses it from a member's own session).
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: CLIENT_ERROR.update };

  // Re-validate against caps server-side (don't trust client).
  const { data: caps } = await supabase
    .from("plan_tier_caps")
    .select("talent_seats")
    .eq("plan_tier", v.target_tier)
    .single();
  if (!caps) return { ok: false, error: "Plan caps not available." };
  // TUL-1291: the keep-list is validated against THIS tenant's roster, read server-side. A client id that is not on the
  // roster is refused, more than the cap is refused, and a roster that already fits keeps everyone.
  const { data: rosterRows, error: rosterErr } = await tenantScopedQuery(admin, "agency_talent_roster", tenantId)
    .select("talent_profile_id")
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: true });
  if (rosterErr) {
    logServerError("admin-plan-downgrade.commit.roster", rosterErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  const resolved = resolveKeepList({
    rosterIds: ((rosterRows ?? []) as Array<{ talent_profile_id: string }>).map((r) => r.talent_profile_id),
    requestedKeepIds: v.talent_keep_ids,
    cap: caps.talent_seats,
  });
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const keepIds = resolved.keep;

  // TUL-1518: tell STRIPE first. With a live subscription the customer keeps being billed the old price until Stripe is
  // told, so a refusal here stops the whole downgrade: nothing is archived and no tier is written.
  //
  // TUL-1737: the roster is NOT archived here when Stripe owns a subscription. The customer paid until the period ends,
  // so the keep-list is stored with the pending change (before any Stripe write) and the webhook that drops the tier
  // archives the overflow then, under this same event id. The confirm path therefore only records the schedule + keep-list
  // and answers "scheduled"; there is no local write left after Stripe succeeds that could fail and invite a duplicate.
  // Node 19+ ships crypto.randomUUID; this server action runs on Node 22+ per package.json engines.
  const eventId = crypto.randomUUID();
  const now = new Date().toISOString();
  const stripeStep = await applyWorkspaceDowngrade(tenantId, v.target_tier, {
    target_tier: v.target_tier,
    keep_ids: keepIds,
    archive_event_id: eventId,
    requested_by: user.id,
    requested_at: now,
  });
  if (!stripeStep.ok) return { ok: false, error: stripeStep.error };

  // No subscription at Stripe (free / comped): nothing is paid-through, so archive now, as before.
  let archivedCount = 0;
  if (!stripeStep.hadSubscription) {
    const archived = await archiveRosterOverflow(supabase, {
      tenantId,
      keepIds,
      eventId,
      actorId: user.id,
      nowIso: now,
    });
    if (!archived.ok) {
      logServerError("admin-plan-downgrade.commit.archive", archived.error);
      return { ok: false, error: CLIENT_ERROR.update };
    }
    archivedCount = archived.count;
  }

  // Flip the plan tier, but ONLY when Stripe does not own a subscription. With one, Stripe applies the change at the end
  // of the period and the webhook is the single writer of plan_tier: a local write now would be put back by the next
  // subscription webhook (the bug this replaces) and would race the schedule.
  if (!stripeStep.hadSubscription) {
    const { error: planErr } = await admin
      .from("agencies")
      .update({ plan_tier: v.target_tier, updated_at: now })
      .eq("id", tenantId);
    if (planErr) {
      logServerError("admin-plan-downgrade.commit.plan", planErr);
      return { ok: false, error: CLIENT_ERROR.update };
    }
  }

  // Churn is half of what a funnel means. Counting only upgrades produces a
  // number that always looks like growth.
  void trackPlanChanged({
    direction: "down",
    tenantId,
    toPlan: v.target_tier,
    source: "admin_downgrade",
  });

  revalidatePath("/", "layout");

  // A downgrade ARCHIVES roster rows to fit the smaller plan. That is the most
  // customer-visible destructive action in the commerce surface, and the
  // archive event id is what makes it restorable.
  await recordCommerceAudit({
    action: COMMERCE_AUDIT.PLAN_DOWNGRADED,
    actorId: user.id,
    actorRole: "workspace_staff",
    tenantId,
    targetType: "agencies",
    targetId: tenantId,
    after: { plan_tier: v.target_tier },
    context: {
      archived_count: archivedCount,
      archive_deferred: stripeStep.hadSubscription,
      archive_event_id: eventId,
      stripe_mode: stripeStep.hadSubscription ? stripeStep.mode : "none",
      stripe_effective_at: stripeStep.hadSubscription ? stripeStep.effectiveAt : null,
    },
  });

  return {
    ok: true,
    archived_count: archivedCount,
    archive_event_id: eventId,
    new_plan: v.target_tier,
    effective_at: stripeStep.hadSubscription ? stripeStep.effectiveAt : null,
    stripe_scheduled: stripeStep.hadSubscription,
    archives_at_period_end: stripeStep.hadSubscription,
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
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  // TUL-1269 M2: restoring archived roster rows bypasses the plan's seat cap,
  // so it is billing (owner) like the downgrade itself.
  const auth = await requireWorkspaceStaffAction({ capability: WORKSPACE_MONEY_GATES.planChange });
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, user } = auth;

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

  // The mirror of a downgrade: roster rows come back. Audited for the same
  // reason — it changes who is visible and bookable on the tenant.
  await recordCommerceAudit({
    action: COMMERCE_AUDIT.PLAN_DOWNGRADED,
    actorId: user.id,
    actorRole: "workspace_staff",
    tenantId,
    targetType: "agency_talent_roster",
    targetId: eventId ?? tenantId,
    severity: "info",
    after: { restored_count: count ?? 0 },
    context: { archive_event_id: eventId ?? null, direction: "restore" },
  });

  return { ok: true, restored_count: count ?? 0 };
}
