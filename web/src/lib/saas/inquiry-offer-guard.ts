import "server-only";

/**
 * TUL-484: the server-action gate for the three offer verbs a talent selling in
 * her OWN business may use before anyone has accepted an invite.
 *
 * `requireInquiryManagerAction` admits workspace staff and an ACTIVE coordinator.
 * A talent-type workspace (the hub, a talent's own site) has no staff membership
 * and a fresh inquiry seats its coordinator and talent as 'invited', so the
 * action refused her ("not the coordinator") before the engine's own-lineup rule
 * (`ownerTalentOwnLineupOfferAllowed`, `validateActorPermission`) was ever asked.
 *
 * Authorization: this adds NO rule of its own. It falls back to the engine's
 * `validateActorPermission` for the same verb and accepts only a NON-staff actor
 * holding a talent profile. That is exactly the set the engine admits through its
 * own-lineup and talent_self branches (sole live seat on a workspace she owns or
 * a talent-type workspace; her own self inquiry). Staff of another tenant never
 * pass (the engine returns isStaff:true for them, refused here), so the inquiry's
 * tenant is never taken from an actor who is not seated on it. The engine
 * re-checks the same rule inside createOffer / updateOfferDraft / sendOffer.
 * Fails closed on any missing piece.
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  requireInquiryManagerAction,
  type InquiryManagerActionGuard,
} from "@/lib/saas/admin-scope";
import { requireSession } from "@/lib/server/action-guards";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  validateActorPermission,
  type EngineAction,
} from "@/lib/inquiry/inquiry-permissions";

export type OfferVerb = Extract<EngineAction, "create_offer" | "update_offer" | "send_offer">;

export type OfferGuardDeps = {
  manager: (inquiryId: string) => Promise<InquiryManagerActionGuard | { ok: false; error: string }>;
  session: () => Promise<{ supabase: SupabaseClient; user: User } | null>;
  permission: (
    supabase: SupabaseClient,
    inquiryId: string,
    userId: string,
    verb: OfferVerb,
  ) => Promise<{ ok: boolean; isStaff?: boolean; talentProfileId?: string | null }>;
  workspaceOf: (inquiryId: string) => Promise<{ tenantId: string; tenantSlug: string } | null>;
};

const defaultDeps: OfferGuardDeps = {
  manager: requireInquiryManagerAction,
  session: async () => {
    const auth = await requireSession();
    return auth.ok ? { supabase: auth.supabase, user: auth.user } : null;
  },
  permission: (supabase, inquiryId, userId, verb) =>
    validateActorPermission(supabase, inquiryId, userId, verb),
  workspaceOf: async (inquiryId) => {
    const admin = createServiceRoleClient();
    if (!admin) return null;
    // A failed read fails closed (no workspace -> the guard refuses), but is logged so it is not mistaken for "no access".
    const { data: inq, error: inqError } = await admin.from("inquiries").select("tenant_id").eq("id", inquiryId).maybeSingle();
    if (inqError) {
      logServerError("inquiry-offer-guard.workspaceOf.inquiry", inqError);
      return null;
    }
    const tenantId = (inq?.tenant_id as string | null) ?? null;
    if (!tenantId) return null;
    const { data: agency, error: agencyError } = await admin.from("agencies").select("slug").eq("id", tenantId).maybeSingle();
    if (agencyError) {
      logServerError("inquiry-offer-guard.workspaceOf.agency", agencyError);
      return null;
    }
    const tenantSlug = (agency?.slug as string | null) ?? null;
    return tenantSlug ? { tenantId, tenantSlug } : null;
  },
};

export async function requireInquiryOfferAction(
  inquiryId: string,
  verb: OfferVerb,
  deps: OfferGuardDeps = defaultDeps,
): Promise<InquiryManagerActionGuard | { ok: false; error: string }> {
  const manager = await deps.manager(inquiryId);
  if (manager.ok) return manager;

  const trimmed = typeof inquiryId === "string" ? inquiryId.trim() : "";
  if (!trimmed) return manager;
  const session = await deps.session();
  if (!session) return manager;
  const perm = await deps.permission(session.supabase, trimmed, session.user.id, verb);
  if (!perm.ok || perm.isStaff || !perm.talentProfileId) return manager;
  const ws = await deps.workspaceOf(trimmed);
  if (!ws) return manager;
  return {
    ok: true,
    supabase: session.supabase,
    user: session.user,
    tenantId: ws.tenantId,
    tenantSlug: ws.tenantSlug,
    isStaff: false,
  };
}
