/**
 * approve.server.ts — turning an approved recommendation into a real signup.
 *
 * The hinge of the whole flow. Everything before this is understanding;
 * everything after is the existing product. So this module's one job is to
 * translate the Brief's vocabulary into the vocabulary the existing pipeline
 * already speaks, and then get out of the way.
 *
 * WHY IT DOES NOT PROVISION ANYTHING ITSELF
 * ────────────────────────────────────────
 * It writes a `saas_marketing_signups` lead and hands back a URL into
 * `/onboarding/workspace?lead=...`. It does not create an agency, a membership,
 * a homepage or a Stripe session, because `provisionWorkspaceFromLead` already
 * does all of that, correctly, including the parts that are easy to get wrong:
 * slug collision, one-free-workspace-per-owner, crash recovery, checkout,
 * founder alerts, starter content.
 *
 * A second provisioning path would be a second set of those bugs. The AI intake
 * earns its keep by filling the lead in BETTER than a form can, not by
 * reimplementing what happens next.
 *
 * WHAT APPROVAL MEANS
 * ───────────────────
 * A version snapshot, an immutable record of what was agreed. Decision L20 says
 * generated content stays a draft until a human approves it; this is that
 * moment, and the snapshot is the evidence. It is also what makes the override
 * telemetry meaningful: the engine's recommendation and the user's choice are
 * both known at exactly one point in time.
 */

import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { buildWorkspaceOnboardingPath } from "@/lib/saas/workspace-signup";

import {
  linkBriefObjects,
  setBriefStatus,
  snapshotBrief,
  type BriefOwner,
} from "./brief-store.server";
import { factValue, type Brief } from "./brief-store";
import { ENGINE_VERSION, type Recommendation } from "./engine";
import { diffRecommendation, logRecommendationOverride } from "./intake-telemetry";

/** What the visitor actually agreed to, after any edits on the screen. */
export type ApprovedChoice = {
  talentProfile: boolean;
  workspace: boolean;
  workspaceType: "talent" | "business" | null;
  workspacePlan: string | null;
  talentPlan: string | null;
};

export type ApproveResult =
  | { ok: true; nextPath: string; leadId: string | null }
  | { ok: false; error: string };

/**
 * The `audience` value the existing pipeline expects.
 *
 * The Brief never asked "are you an agency, an organization, a business, or an
 * operator" — that is internal taxonomy, and refusing to ask it is the entire
 * premise of the conversational intake. So it is DERIVED here, from what the
 * person actually described:
 *
 *   business  → clients book the place, not a person. Drives
 *               `workspace_type = 'business'`, which hides the roster.
 *   agency    → a roster of named people clients choose between.
 *   operator  → a solo professional, no workspace.
 *
 * `organization` is deliberately never derived. It exists for bands and
 * collectives, and nothing in the fact vocabulary distinguishes one from an
 * agency, so guessing would put people in a shape they did not ask for.
 *
 * An unknown shape resolves to `business`, the conservative side. Hiding a
 * roster later is a settings change; a team page published under someone's name
 * that they never asked for has already happened.
 */
export function audienceForChoice(
  choice: ApprovedChoice,
): "operator" | "agency" | "business" {
  if (!choice.workspace) return "operator";
  return choice.workspaceType === "talent" ? "agency" : "business";
}

/**
 * The `tier_interest` value the pipeline expects, from the engine's plan key.
 *
 * `free` and `talent_*` both map to null, which the lead schema reads as "free
 * workspace". A talent plan is not a workspace tier and must never be written
 * into this column, or the provisioner would try to sell a workspace upgrade to
 * someone who only wanted a profile.
 */
export function tierInterestForChoice(choice: ApprovedChoice): string | null {
  if (!choice.workspace) return null;
  const plan = choice.workspacePlan;
  if (plan === "website" || plan === "studio" || plan === "agency" || plan === "network") {
    return plan;
  }
  return null;
}

/**
 * The roster bucket. Required by the lead schema, so it has to be something.
 *
 * Derived from the actual head count rather than asked. The buckets are the
 * form's, and the mapping is deliberately conservative at the boundaries: a
 * stated 5 lands in "1-5", not "6-20", because the count came from a
 * conversation and rounding UP would nudge someone toward a bigger plan than
 * they described.
 */
export function rosterBucketForCount(count: number): "1-5" | "6-20" | "21-50" | "50+" {
  if (count <= 5) return "1-5";
  if (count <= 20) return "6-20";
  if (count <= 50) return "21-50";
  return "50+";
}

/**
 * Approve a recommendation and return where to send the visitor.
 *
 * Order matters and is not arbitrary:
 *   1. Telemetry first, while both the recommendation and the choice are known.
 *      Signal 3 is the highest-quality label in the system and it exists for
 *      exactly one instant.
 *   2. Snapshot, so what was agreed is frozen before anything acts on it.
 *   3. Lead, which is the handoff to the existing pipeline.
 *   4. Status, last, so a failure anywhere above leaves the brief in
 *      `discovering` and the visitor can try again rather than being stuck in
 *      `approved` with no lead.
 */
export async function approveRecommendation(input: {
  owner: BriefOwner;
  brief: Brief;
  recommendation: Recommendation;
  choice: ApprovedChoice;
  email: string | null;
  locale: string;
  scope: { sessionId?: string | null; userId?: string | null };
}): Promise<ApproveResult> {
  const { brief, recommendation, choice } = input;

  if (!choice.talentProfile && !choice.workspace) {
    return { ok: false, error: "Pick at least one thing to set up." };
  }

  // 1. Signal 3 — the user's own correction of the engine, or their agreement.
  const changes = diffRecommendation(recommendation, choice);
  void logRecommendationOverride(input.scope, recommendation, changes).catch(() => {});

  // 2. Freeze what was agreed.
  const snapshot = await snapshotBrief(brief.id, {
    expectedVersion: brief.currentVersion,
    reason: "intake",
    createdBy: input.scope.userId ?? null,
    engineVersion: ENGINE_VERSION,
  });
  if (!snapshot.ok) {
    // A conflict means another tab approved first. Not an error worth showing:
    // the other tab's approval is just as valid, so carry on.
    if (!snapshot.conflict) {
      logServerError("tulala.approve.snapshot", new Error(snapshot.error));
      return { ok: false, error: "Could not save your approval. Try again?" };
    }
  }

  // 3. Talent-only needs no lead: talent onboarding is its own path and does not
  // read `saas_marketing_signups` at all.
  if (!choice.workspace) {
    await setBriefStatus(brief.id, "approved");
    return { ok: true, nextPath: "/onboarding/talent-location", leadId: null };
  }

  // The email may already be on the lead row from the mid-conversation capture,
  // in which case the screen does not show the field at all and posts nothing.
  const email = input.email?.trim() || (await emailOnLead(brief.signupLeadId));
  if (!email) {
    return { ok: false, error: "I need an email address to set this up." };
  }

  const leadId = await upsertLeadForBrief({
    brief,
    choice,
    email,
    locale: input.locale,
    profileId: input.scope.userId ?? null,
  });
  if (!leadId) {
    return { ok: false, error: "Could not start your workspace. Try again?" };
  }

  await linkBriefObjects(brief.id, { signupLeadId: leadId });
  await setBriefStatus(brief.id, "approved");

  return { ok: true, nextPath: buildWorkspaceOnboardingPath(leadId), leadId };
}

/**
 * Write (or update) the lead this brief hands off to.
 *
 * Reuses the brief's existing lead row when one is already linked — the email
 * capture during conversation creates one, and inserting a second would split
 * one person across two leads and break the provisioner's idempotency, which
 * keys on `lead.provisioned_tenant_id`.
 */
async function upsertLeadForBrief(input: {
  brief: Brief;
  choice: ApprovedChoice;
  email: string;
  locale: string;
  profileId: string | null;
}): Promise<string | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { brief, choice } = input;
  const name = stringOf(brief, "person.name") ?? "";
  const businessName =
    stringOf(brief, "business.name") ??
    stringOf(brief, "person.professional_name") ??
    (name || "My workspace");

  const row = {
    email: input.email,
    name: name || "Unknown",
    business_name: businessName,
    // The single richest thing anyone said about themselves, and what the
    // starter-content generator reads to pick a design and write copy. Passing
    // it is the difference between a generic template and a page about them.
    business_description: stringOf(brief, "business.description"),
    audience: audienceForChoice(choice),
    roster_size: rosterBucketForCount(numberOf(brief, "business.staff_count") ?? 1),
    tier_interest: tierInterestForChoice(choice),
    source_page: "/get-started/agent",
    ...(input.profileId ? { claimed_by_profile_id: input.profileId } : {}),
  };

  if (brief.signupLeadId) {
    const { error } = await supabase
      .from("saas_marketing_signups")
      .update(row)
      .eq("id", brief.signupLeadId);
    if (error) {
      logServerError("tulala.approve.leadUpdate", error);
      return null;
    }
    return brief.signupLeadId;
  }

  const { data, error } = await supabase
    .from("saas_marketing_signups")
    .insert(row)
    .select("id")
    .single();
  if (error || !data) {
    logServerError("tulala.approve.leadInsert", error);
    return null;
  }
  return data.id as string;
}

/**
 * The email already recorded for this brief, if any.
 *
 * Read from the lead row rather than the Brief because that is where the
 * mid-conversation capture puts it, deliberately: an address belongs with the
 * other leads, not in a fact table whose rows are all AI-proposable.
 */
export async function emailOnLead(leadId: string | null): Promise<string | null> {
  if (!leadId) return null;
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("saas_marketing_signups")
    .select("email")
    .eq("id", leadId)
    .maybeSingle();

  const email = typeof data?.email === "string" ? data.email.trim() : "";
  return email || null;
}

function stringOf(brief: Brief, key: string): string | null {
  const value = factValue(brief, key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOf(brief: Brief, key: string): number | null {
  const value = factValue(brief, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
