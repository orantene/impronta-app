"use server";

/**
 * Admin server actions for the Pitch feature.
 *
 * Each action wraps a pitch-engine function with: auth, tenant resolution,
 * capability check, and revalidation. The engine itself is in
 * `@/lib/pitch/pitch-engine` and is auth-agnostic so it can be reused by
 * the public token-driven actions.
 *
 * Capability: agency.pitch.manage.
 */

import { revalidatePath } from "next/cache";

import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

import {
  cancelPitch as cancelPitchEngine,
  createPitchDraft as createPitchDraftEngine,
  sendPitch as sendPitchEngine,
  updatePitchDraft as updatePitchDraftEngine,
} from "@/lib/pitch/pitch-engine";
import { canUsePitchFeature } from "@/lib/pitch/pitch-plan-gate";
import { normalizeWorkspaceType, rosterEnabled } from "@/lib/saas/workspace-type";
import {
  signPitchToken,
  buildPitchShareUrl,
  buildWhatsappDeepLink,
  buildEmailDeepLink,
} from "@/lib/pitch/pitch-share-token";
import type {
  CreatePitchDraftInput,
  PitchErrorReason,
  PitchResult,
  PitchRow,
  PitchShareChannel,
  SentPitchOutput,
  UpdatePitchDraftInput,
} from "@/lib/pitch/pitch-types";

const CAPABILITY = "agency.pitch.manage";

type AuthOk = {
  ok: true;
  tenantId: string;
  actorUserId: string;
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>;
};
type AuthErr = { ok: false; reason: PitchErrorReason };

async function authorise(tenantSlug: string): Promise<AuthOk | AuthErr> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, reason: "not_authenticated" };

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, reason: "tenant_not_found" };

  const allowed = await userHasCapability(CAPABILITY, scope.tenantId);
  if (!allowed) return { ok: false, reason: "forbidden" };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "internal_error" };

  // Phase G PR 3 — plan-tier gate. Pitches are a Studio+ feature per the
  // binding spec (project_pitch_feature.md). Free workspaces hit this
  // gate; the UI reads `canUsePitchFeature(plan)` from the same module
  // to render the upsell card instead of the compose UI.
  const { data: agency, error: agencyErr } = await admin
    .from("agencies")
    .select("plan_tier, workspace_type")
    .eq("id", scope.tenantId)
    .maybeSingle();
  if (agencyErr) {
    logServerError("pitches.authorise.loadPlan", agencyErr);
    return { ok: false, reason: "internal_error" };
  }

  // Workspace-type gate (2026-08 — business workspaces). A pitch is "here is
  // the talent I represent"; a business workspace represents nobody, so the
  // feature does not exist for it regardless of plan tier. `forbidden` rather
  // than `plan_not_eligible` deliberately — this is not an upsell, no plan
  // unlocks it. Fails CLOSED toward "talent": only a row that positively says
  // 'business' is refused, so an unknown value never locks an agency out.
  if (!rosterEnabled(normalizeWorkspaceType(agency?.workspace_type))) {
    return { ok: false, reason: "forbidden" };
  }
  // QA 2026-06-13: the column is `plan_tier`, not `plan` — selecting the
  // nonexistent `plan` errored the query → every pitch compose hit the plan
  // gate and returned plan_not_eligible/internal_error. Fixed to plan_tier.
  if (!canUsePitchFeature(agency?.plan_tier ?? null)) {
    return { ok: false, reason: "plan_not_eligible" };
  }

  return { ok: true, tenantId: scope.tenantId, actorUserId: session.user.id, admin };
}

export async function createPitchDraftAction(
  tenantSlug: string,
  input: Omit<CreatePitchDraftInput, "tenantId" | "actorUserId">,
): Promise<PitchResult<{ pitchId: string }>> {
  const auth = await authorise(tenantSlug);
  if (!auth.ok) return { ok: false, reason: auth.reason };

  try {
    const result = await createPitchDraftEngine(auth.admin, {
      ...input,
      tenantId: auth.tenantId,
      actorUserId: auth.actorUserId,
    });
    if (result.ok) revalidatePath(`/${tenantSlug}/admin/pitches`);
    return result;
  } catch (e) {
    logServerError("pitches.createPitchDraftAction", e);
    return { ok: false, reason: "internal_error" };
  }
}

export async function updatePitchDraftAction(
  tenantSlug: string,
  input: Omit<UpdatePitchDraftInput, "tenantId" | "actorUserId">,
): Promise<PitchResult<void>> {
  const auth = await authorise(tenantSlug);
  if (!auth.ok) return { ok: false, reason: auth.reason };

  try {
    const result = await updatePitchDraftEngine(auth.admin, {
      ...input,
      tenantId: auth.tenantId,
      actorUserId: auth.actorUserId,
    });
    if (result.ok) revalidatePath(`/${tenantSlug}/admin/pitches`);
    return result;
  } catch (e) {
    logServerError("pitches.updatePitchDraftAction", e);
    return { ok: false, reason: "internal_error" };
  }
}

export async function sendPitchAction(
  tenantSlug: string,
  pitchId: string,
  channel: PitchShareChannel,
): Promise<PitchResult<SentPitchOutput>> {
  const auth = await authorise(tenantSlug);
  if (!auth.ok) return { ok: false, reason: auth.reason };

  try {
    const result = await sendPitchEngine(auth.admin, {
      tenantId: auth.tenantId,
      pitchId,
      actorUserId: auth.actorUserId,
      channel,
    });
    if (result.ok) revalidatePath(`/${tenantSlug}/admin/pitches`);
    return result;
  } catch (e) {
    logServerError("pitches.sendPitchAction", e);
    return { ok: false, reason: "internal_error" };
  }
}

export async function cancelPitchAction(
  tenantSlug: string,
  pitchId: string,
): Promise<PitchResult<void>> {
  const auth = await authorise(tenantSlug);
  if (!auth.ok) return { ok: false, reason: auth.reason };

  try {
    const result = await cancelPitchEngine(auth.admin, {
      tenantId: auth.tenantId,
      pitchId,
      actorUserId: auth.actorUserId,
    });
    if (result.ok) revalidatePath(`/${tenantSlug}/admin/pitches`);
    return result;
  } catch (e) {
    logServerError("pitches.cancelPitchAction", e);
    return { ok: false, reason: "internal_error" };
  }
}

/**
 * Load a single pitch's detail bundle for the admin drawer:
 *   - pitch row
 *   - active + removed talent rows joined with display_name
 *   - last 50 pitch_events for timeline
 *   - converted inquiry id (if status=converted)
 */
export type PitchEventRow = {
  id: string;
  event_type: string;
  actor_role: "staff" | "recipient" | "guest" | "system";
  actor_user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type PitchDetailTalent = {
  pitchTalentId: string;
  talentProfileId: string;
  position: number;
  displayName: string;
  adminNote: string | null;
  removedByClientAt: string | null;
};

export type PitchDetail = {
  pitch: PitchRow;
  talents: PitchDetailTalent[];
  events: PitchEventRow[];
};

export async function loadPitchDetailAction(
  tenantSlug: string,
  pitchId: string,
): Promise<PitchResult<PitchDetail>> {
  const auth = await authorise(tenantSlug);
  if (!auth.ok) return { ok: false, reason: auth.reason };

  try {
    const { data: pitchRow, error: pErr } = await auth.admin
      .from("pitches")
      .select("*")
      .eq("id", pitchId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    if (pErr) {
      logServerError("pitches.loadPitchDetailAction/pitch", pErr);
      return { ok: false, reason: "internal_error" };
    }
    if (!pitchRow) return { ok: false, reason: "pitch_not_found" };
    const pitch = pitchRow as PitchRow;

    const { data: talentRows } = await auth.admin
      .from("pitch_talents")
      .select("id, talent_profile_id, position, admin_note, removed_by_client_at")
      .eq("pitch_id", pitch.id)
      .eq("tenant_id", auth.tenantId)
      .order("position", { ascending: true });

    type Trow = {
      id: string;
      talent_profile_id: string;
      position: number;
      admin_note: string | null;
      removed_by_client_at: string | null;
    };
    const tRows = (talentRows ?? []) as Trow[];

    const profileIds = tRows.map((t) => t.talent_profile_id);
    const { data: profileRows } = profileIds.length
      ? await auth.admin
          .from("talent_profiles")
          .select("id, display_name, first_name, last_name")
          .in("id", profileIds)
      : { data: [] };

    type Prow = {
      id: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
    };
    const nameMap = new Map(
      ((profileRows ?? []) as Prow[]).map((p) => [
        p.id,
        p.display_name?.trim() ||
          [p.first_name, p.last_name].filter(Boolean).join(" ") ||
          "Talent",
      ]),
    );

    const talents: PitchDetailTalent[] = tRows.map((t) => ({
      pitchTalentId: t.id,
      talentProfileId: t.talent_profile_id,
      position: t.position,
      displayName: nameMap.get(t.talent_profile_id) ?? "Talent",
      adminNote: t.admin_note,
      removedByClientAt: t.removed_by_client_at,
    }));

    const { data: eventRows } = await auth.admin
      .from("pitch_events")
      .select("id, event_type, actor_role, actor_user_id, payload, created_at")
      .eq("pitch_id", pitch.id)
      .eq("tenant_id", auth.tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    const events = ((eventRows ?? []) as PitchEventRow[]) ?? [];

    return { ok: true, data: { pitch, talents, events } };
  } catch (e) {
    logServerError("pitches.loadPitchDetailAction", e);
    return { ok: false, reason: "internal_error" };
  }
}

/**
 * Mint a fresh share-token URL for an active pitch. Used when the original
 * WhatsApp/email link is lost — re-creates the JWT against the current
 * `share_token_id` (so a previous "cancel + resend" cycle stays revoked).
 *
 * Does NOT rotate share_token_id — that's `cancelPitch`'s job. Only signs
 * a new JWT with the same revision claim and a fresh expiry window.
 */
export type RegeneratedPitchLink = {
  shareUrl: string;
  whatsappDeepLink: string | null;
  emailDeepLink: string | null;
  expiresAt: string;
};

export async function regeneratePitchShareLinkAction(
  tenantSlug: string,
  pitchId: string,
): Promise<PitchResult<RegeneratedPitchLink>> {
  const auth = await authorise(tenantSlug);
  if (!auth.ok) return { ok: false, reason: auth.reason };

  try {
    const { data: pitchRow, error } = await auth.admin
      .from("pitches")
      .select("*")
      .eq("id", pitchId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    if (error) {
      logServerError("pitches.regeneratePitchShareLinkAction/load", error);
      return { ok: false, reason: "internal_error" };
    }
    if (!pitchRow) return { ok: false, reason: "pitch_not_found" };
    const pitch = pitchRow as PitchRow;

    if (pitch.status === "cancelled") return { ok: false, reason: "cancelled" };
    if (pitch.status === "draft") {
      return {
        ok: false,
        reason: "draft_required",
        message: "Send the pitch before generating a share link.",
      };
    }
    if (pitch.expires_at && new Date(pitch.expires_at).getTime() <= Date.now()) {
      return { ok: false, reason: "expired" };
    }

    // Compute TTL from expires_at if set, else default. Signer clamps internally.
    const ttlSeconds = pitch.expires_at
      ? Math.max(1, Math.floor((new Date(pitch.expires_at).getTime() - Date.now()) / 1000))
      : undefined;

    const signed = signPitchToken(
      {
        tenantId: pitch.tenant_id,
        pitchId: pitch.id,
        shareTokenId: pitch.share_token_id,
        issuerProfileId: auth.actorUserId,
      },
      ttlSeconds,
    );

    const baseUrl = process.env.PITCH_PUBLIC_BASE_URL ?? "https://tulala.digital";
    const shareUrl = buildPitchShareUrl(signed.token, baseUrl);

    const recipient = pitch.recipient_contact ?? {};
    const phone = typeof recipient.phone === "string" ? recipient.phone : null;
    const email = typeof recipient.email === "string" ? recipient.email : null;

    // Look up agency name for deep-link copy. Best-effort.
    let agencyName = "your agency";
    const { data: agencyRow } = await auth.admin
      .from("agencies")
      .select("display_name")
      .eq("id", pitch.tenant_id)
      .maybeSingle();
    const fetchedName = (agencyRow as { display_name?: string } | null)?.display_name?.trim();
    if (fetchedName) agencyName = fetchedName;

    return {
      ok: true,
      data: {
        shareUrl,
        whatsappDeepLink: buildWhatsappDeepLink({ shareUrl, agencyName, phone }),
        emailDeepLink: buildEmailDeepLink({ shareUrl, agencyName, email }),
        expiresAt: signed.expiresAt.toISOString(),
      },
    };
  } catch (e) {
    logServerError("pitches.regeneratePitchShareLinkAction", e);
    return { ok: false, reason: "internal_error" };
  }
}
