import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwningParty } from "./owning-party-resolver";
import { logServerError } from "@/lib/server/safe-error";

export type CoordinatorAssignmentInput = {
  source_type: "agency" | "hub";
  tenant_id: string | null;
};

export type CoordinatorAssignmentResult = {
  coordinator_id: string | null;
  assignment_reason: string;
};

async function readSetting(supabase: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  const v = data?.value;
  if (v && typeof v === "object" && v !== null && "value" in v && typeof (v as { value?: unknown }).value === "string") {
    return (v as { value: string }).value;
  }
  if (typeof v === "string") return v;
  return null;
}

/**
 * The active owner (profile id) of a tenant, or null. Used as the coordinator
 * fallback for both agency-owned inquiries (the workspace owner manages them)
 * and hub inquiries (the hub owner is the oversight officer when no global
 * platform coordinator is configured).
 */
export async function resolveTenantOwnerId(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string | null> {
  const { data: ownerRow } = await supabase
    .from("agency_memberships")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (ownerRow as { profile_id?: string } | null)?.profile_id ?? null;
}

/**
 * Resolve default coordinator at inquiry submission time.
 *
 * Per-tenant resolution order (F.1):
 *   1. agencies.default_coordinator_user_id    — workspace owner's explicit choice
 *   2. workspace owner                          — fallback when (1) is null
 *   3. global settings.default_coordinator_user_id — legacy fallback (Phase 1)
 *
 * Hub source resolves the platform OVERSIGHT OFFICER (the "officer / consultant"
 * who sits in talent-direct hub threads for scam/dispute protection + instant
 * support — see inquiry-engine-submit.ts):
 *   1. global settings.platform_coordinator_user_id — the designated platform officer
 *   2. the hub tenant's own owner                   — so every hub still has an officer
 */
export async function assignCoordinatorFromSettings(
  supabase: SupabaseClient,
  input: CoordinatorAssignmentInput,
): Promise<CoordinatorAssignmentResult> {
  if (input.source_type === "hub") {
    const id = await readSetting(supabase, "platform_coordinator_user_id");
    if (id?.trim()) {
      return { coordinator_id: id.trim(), assignment_reason: "hub_default_platform_coordinator" };
    }
    // Fallback: the hub tenant's own owner acts as the oversight officer when no
    // global platform coordinator is configured — so every hub inquiry still has
    // a protective officer in the private thread.
    if (input.tenant_id) {
      const ownerId = await resolveTenantOwnerId(supabase, input.tenant_id);
      if (ownerId) {
        return { coordinator_id: ownerId, assignment_reason: "hub_owner_fallback" };
      }
    }
    return { coordinator_id: null, assignment_reason: "hub_no_platform_coordinator_configured" };
  }

  // 1. Per-tenant explicit default.
  if (input.tenant_id) {
    const { data: agency } = await supabase
      .from("agencies")
      .select("default_coordinator_user_id")
      .eq("id", input.tenant_id)
      .maybeSingle();
    const explicit = (agency as { default_coordinator_user_id?: string | null } | null)
      ?.default_coordinator_user_id;
    if (explicit) {
      return {
        coordinator_id: explicit,
        assignment_reason: "agency_default_coordinator",
      };
    }

    // 2. Workspace owner fallback.
    const ownerId = await resolveTenantOwnerId(supabase, input.tenant_id);
    if (ownerId) {
      return {
        coordinator_id: ownerId,
        assignment_reason: "agency_owner_fallback",
      };
    }
  }

  // 3. Global legacy setting — the platform-wide safety net so an inquiry is
  // never left with NO coordinator even on an owner-less workspace.
  const id = await readSetting(supabase, "default_coordinator_user_id");
  return {
    coordinator_id: id?.trim() || null,
    assignment_reason: id ? "agency_legacy_default_coordinator" : "agency_manual_pickup",
  };
}

/**
 * Seed coordinators for talents whose resolved owning party is an AGENCY that
 * differs from the inquiry's tenant — the cross-tenant case.
 *
 * Example: a client inquires about an EXCLUSIVE talent via the open hub, so the
 * inquiry is filed under the hub tenant but the talent is owned by their agency.
 * The inquiry-tenant coordinator lookup resolves the wrong (or no) workspace's
 * coordinator, leaving the inquiry unmanaged. This seeds the OWNING agency's
 * default coordinator (one per distinct owning agency, deduped against any
 * already-assigned coordinator) and promotes the first one to the inquiry's
 * coordinator of record when none was set.
 *
 * No-op for same-tenant inquiries (the common case: owning agency ==
 * inquiry tenant) — the primary assignment already covers those. Best-effort:
 * never throws (the inquiry is already persisted).
 *
 * @returns the inquiry's coordinator id after seeding (existing or newly promoted).
 */
export async function seedOwningAgencyCoordinators(
  supabase: SupabaseClient,
  opts: {
    inquiryId: string;
    inquiryTenantId: string;
    talentProfileIds: string[];
    owningParties: Map<string, OwningParty>;
    existingCoordinatorId: string | null;
  },
): Promise<string | null> {
  let coordinatorOfRecord = opts.existingCoordinatorId;
  try {
    const owningAgencyIds = new Set<string>();
    for (const tid of opts.talentProfileIds) {
      const op = opts.owningParties.get(tid);
      if (op?.type === "agency" && op.id && op.id !== opts.inquiryTenantId) {
        owningAgencyIds.add(op.id);
      }
    }
    if (owningAgencyIds.size === 0) return coordinatorOfRecord;

    const seen = new Set<string>(coordinatorOfRecord ? [coordinatorOfRecord] : []);
    for (const agencyId of owningAgencyIds) {
      const agencyAssignment = await assignCoordinatorFromSettings(supabase, {
        source_type: "agency",
        tenant_id: agencyId,
      });
      const uid = agencyAssignment.coordinator_id;
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      await supabase.from("inquiry_participants").insert({
        inquiry_id: opts.inquiryId,
        tenant_id: opts.inquiryTenantId,
        user_id: uid,
        role: "coordinator",
        status: "invited",
      });
      // Promote to coordinator of record when none was set (e.g. hub-filed).
      if (!coordinatorOfRecord) {
        await supabase
          .from("inquiries")
          .update({ coordinator_id: uid, coordinator_assigned_at: new Date().toISOString() })
          .eq("id", opts.inquiryId)
          .is("coordinator_id", null);
        coordinatorOfRecord = uid;
      }
    }
  } catch (err) {
    logServerError("coordinator-assignment.seedOwningAgencyCoordinators", err);
  }
  return coordinatorOfRecord;
}
