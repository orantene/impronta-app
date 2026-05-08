/**
 * Pitch engine — pure functions over a SupabaseClient.
 *
 * Nothing here reads `auth.uid()` or session state. Tenant id and actor id
 * are passed in by the server-action wrapper. This makes the engine
 * testable and lets us call it from public token routes (where there is
 * no authenticated user) using the service-role client.
 *
 * Locked behaviour (see project_pitch_feature.md):
 *   - Only `talent_profiles.workflow_status='approved' AND visibility='public'`
 *     talents may be added (and only if rostered to the tenant).
 *   - One pitch → one inquiry. Convert is idempotent.
 *   - Pitch-converted inquiries bypass talent contact policy. Logged as
 *     `pitch_curated_override` in pitch_events.
 *   - No talent notification on pitch send. First ping is at conversion.
 *   - Re-pitches are new rows with parent_pitch_id set; no in-place revision.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { submitInquiry } from "@/lib/inquiry/inquiry-engine-submit";
import {
  signPitchToken,
  buildPitchShareUrl,
  buildWhatsappDeepLink,
  buildEmailDeepLink,
  verifyPitchToken,
} from "./pitch-share-token";
import { emitPitchEvent } from "./pitch-events";
import {
  PITCH_EVENT_TYPES,
  type ConvertPitchInput,
  type ConvertedPitchOutput,
  type CreatePitchDraftInput,
  type PitchResult,
  type PitchRow,
  type SendPitchInput,
  type SentPitchOutput,
  type UpdatePitchDraftInput,
} from "./pitch-types";

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Confirms a list of talent IDs are eligible to be on a pitch:
 *   - on this tenant's roster (status != 'removed')
 *   - workflow_status = 'approved'
 *   - visibility = 'public'
 *
 * Returns the IDs that pass; the caller treats any drop as a validation error.
 */
async function filterPublishableTalentIds(
  supabase: SupabaseClient,
  tenantId: string,
  talentIds: string[],
): Promise<string[]> {
  if (talentIds.length === 0) return [];

  // 1. Roster membership (security boundary — never let cross-tenant IDs in).
  const { data: rosterRows } = await supabase
    .from("agency_talent_roster")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .in("talent_profile_id", talentIds)
    .neq("status", "removed");
  const onRoster = new Set(
    (rosterRows ?? []).map((r) => (r as { talent_profile_id: string }).talent_profile_id),
  );
  const rosterFiltered = talentIds.filter((id) => onRoster.has(id));
  if (rosterFiltered.length === 0) return [];

  // 2. Public-readable: workflow_status='approved' AND visibility='public'.
  const { data: profileRows } = await supabase
    .from("talent_profiles")
    .select("id")
    .in("id", rosterFiltered)
    .eq("workflow_status", "approved")
    .eq("visibility", "public")
    .is("deleted_at", null);
  const publishable = new Set(
    (profileRows ?? []).map((r) => (r as { id: string }).id),
  );
  return rosterFiltered.filter((id) => publishable.has(id));
}

/**
 * Loads a pitch by token. Verifies the JWT, then re-loads the row from
 * the DB and confirms `share_token_id` matches the token's revision claim.
 * This is the revocation point — rotating share_token_id (or cancelling)
 * invalidates the token immediately even though the JWT itself is still
 * within its expiry window.
 *
 * Auto-transitions an expired pitch to `expired` on first read past
 * `expires_at`, mirroring the behaviour we promise on the public landing.
 */
export async function loadPitchByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<PitchResult<PitchRow>> {
  const verify = verifyPitchToken(token);
  if (!verify.ok) {
    if (verify.reason === "expired") {
      return { ok: false, reason: "token_expired" };
    }
    return { ok: false, reason: "token_invalid", message: verify.reason };
  }

  const { data: row, error } = await supabase
    .from("pitches")
    .select("*")
    .eq("id", verify.claims.pitchId)
    .eq("tenant_id", verify.claims.tenantId)
    .maybeSingle();
  if (error) return { ok: false, reason: "internal_error", message: error.message };
  if (!row) return { ok: false, reason: "pitch_not_found" };

  const pitch = row as PitchRow;

  // Token revocation: share_token_id must match the token's revision claim.
  if (pitch.share_token_id !== verify.claims.shareTokenId) {
    return { ok: false, reason: "token_revoked" };
  }

  if (pitch.status === "cancelled") {
    return { ok: false, reason: "cancelled" };
  }
  if (pitch.status === "draft") {
    // Drafts are not viewable via token. Treat as not-found to avoid leaking
    // the existence of in-progress drafts.
    return { ok: false, reason: "pitch_not_found" };
  }
  if (pitch.status === "converted") {
    // Converted pitches stay readable so the landing can show "you've already
    // opened an inquiry from this pitch." Caller decides what to render.
    return { ok: true, data: pitch };
  }

  // Expiry check + auto-transition.
  if (
    pitch.expires_at &&
    new Date(pitch.expires_at).getTime() <= Date.now() &&
    pitch.status !== "expired"
  ) {
    await supabase
      .from("pitches")
      .update({ status: "expired" })
      .eq("id", pitch.id)
      .eq("tenant_id", pitch.tenant_id);
    await emitPitchEvent(supabase, {
      tenantId: pitch.tenant_id,
      pitchId: pitch.id,
      eventType: PITCH_EVENT_TYPES.EXPIRED,
      actorRole: "system",
    });
    return { ok: false, reason: "expired" };
  }

  return { ok: true, data: pitch };
}

// ─── Engine functions ───────────────────────────────────────────────────

/**
 * Create a pitch in draft status. Talent IDs are filtered to publishable-only
 * before insert — anything that fails the eligibility check is silently
 * dropped (the admin compose UI is responsible for showing only eligible
 * talents in the first place; this is a defence-in-depth backstop).
 *
 * Returns the new pitch id. Status starts as 'draft' — admin must call
 * `sendPitch` separately.
 */
export async function createPitchDraft(
  supabase: SupabaseClient,
  input: CreatePitchDraftInput,
): Promise<PitchResult<{ pitchId: string }>> {
  if (!input.tenantId) return { ok: false, reason: "tenant_not_found" };
  if (!input.actorUserId) return { ok: false, reason: "not_authenticated" };

  const eligibleIds = await filterPublishableTalentIds(
    supabase,
    input.tenantId,
    input.talentProfileIds,
  );

  // Drafts can have zero talents — the admin may be composing iteratively.
  // The send action enforces the "at least one talent" rule.

  const { data: pitchRow, error: pitchErr } = await supabase
    .from("pitches")
    .insert({
      tenant_id: input.tenantId,
      created_by_user_id: input.actorUserId,
      parent_pitch_id: input.parentPitchId ?? null,
      status: "draft",
      recipient_user_id: input.recipientUserId ?? null,
      recipient_contact: input.recipientContact ?? {},
      personal_note: input.personalNote ?? null,
      brief: input.brief ?? {},
      expires_at: input.expiresAt ?? null,
      internal_notes: input.internalNotes ?? null,
    })
    .select("id")
    .single();

  if (pitchErr || !pitchRow) {
    return {
      ok: false,
      reason: "internal_error",
      message: pitchErr?.message ?? "insert_failed",
    };
  }

  const pitchId = (pitchRow as { id: string }).id;

  if (eligibleIds.length > 0) {
    const rows = eligibleIds.map((tid, i) => ({
      tenant_id: input.tenantId,
      pitch_id: pitchId,
      talent_profile_id: tid,
      position: i,
      admin_note: input.talentNotes?.[tid] ?? null,
    }));
    const { error: tErr } = await supabase.from("pitch_talents").insert(rows);
    if (tErr) {
      // Roll back the pitch row so we don't leak orphans.
      await supabase.from("pitches").delete().eq("id", pitchId);
      return { ok: false, reason: "internal_error", message: tErr.message };
    }
  }

  await emitPitchEvent(supabase, {
    tenantId: input.tenantId,
    pitchId,
    eventType: PITCH_EVENT_TYPES.CREATED,
    actorUserId: input.actorUserId,
    actorRole: "staff",
    payload: {
      talentCount: eligibleIds.length,
      droppedCount: input.talentProfileIds.length - eligibleIds.length,
    },
  });

  return { ok: true, data: { pitchId } };
}

/**
 * Update a draft pitch. Once a pitch is sent, the only mutations allowed
 * are recipient-driven (remove talent, decline) or admin-only (cancel).
 * Use `cancelPitch` + new `createPitchDraft` for substantive changes
 * to a sent pitch.
 */
export async function updatePitchDraft(
  supabase: SupabaseClient,
  input: UpdatePitchDraftInput,
): Promise<PitchResult<void>> {
  const { data: existing, error: loadErr } = await supabase
    .from("pitches")
    .select("id, status")
    .eq("id", input.pitchId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (loadErr) return { ok: false, reason: "internal_error", message: loadErr.message };
  if (!existing) return { ok: false, reason: "pitch_not_found" };
  if ((existing as { status: string }).status !== "draft") {
    return { ok: false, reason: "draft_required" };
  }

  const updates: Record<string, unknown> = {};
  if (input.recipientUserId !== undefined) updates.recipient_user_id = input.recipientUserId;
  if (input.recipientContact !== undefined) updates.recipient_contact = input.recipientContact;
  if (input.personalNote !== undefined) updates.personal_note = input.personalNote;
  if (input.brief !== undefined) updates.brief = input.brief;
  if (input.expiresAt !== undefined) updates.expires_at = input.expiresAt;
  if (input.internalNotes !== undefined) updates.internal_notes = input.internalNotes;

  if (Object.keys(updates).length > 0) {
    const { error: upErr } = await supabase
      .from("pitches")
      .update(updates)
      .eq("id", input.pitchId)
      .eq("tenant_id", input.tenantId);
    if (upErr) return { ok: false, reason: "internal_error", message: upErr.message };
  }

  // Rewrite the talent list if provided. Simpler than a diff.
  if (input.talentProfileIds !== undefined) {
    const eligibleIds = await filterPublishableTalentIds(
      supabase,
      input.tenantId,
      input.talentProfileIds,
    );
    await supabase
      .from("pitch_talents")
      .delete()
      .eq("pitch_id", input.pitchId)
      .eq("tenant_id", input.tenantId);
    if (eligibleIds.length > 0) {
      const rows = eligibleIds.map((tid, i) => ({
        tenant_id: input.tenantId,
        pitch_id: input.pitchId,
        talent_profile_id: tid,
        position: i,
        admin_note: input.talentNotes?.[tid] ?? null,
      }));
      const { error: tErr } = await supabase.from("pitch_talents").insert(rows);
      if (tErr) return { ok: false, reason: "internal_error", message: tErr.message };
    }
  } else if (input.talentNotes) {
    // Notes-only update: patch admin_note per talent without touching positions.
    for (const [tid, note] of Object.entries(input.talentNotes)) {
      await supabase
        .from("pitch_talents")
        .update({ admin_note: note })
        .eq("pitch_id", input.pitchId)
        .eq("talent_profile_id", tid)
        .eq("tenant_id", input.tenantId);
    }
  }

  await emitPitchEvent(supabase, {
    tenantId: input.tenantId,
    pitchId: input.pitchId,
    eventType: PITCH_EVENT_TYPES.UPDATED,
    actorUserId: input.actorUserId,
    actorRole: "staff",
  });

  return { ok: true, data: undefined };
}

/**
 * Send a draft pitch — mints the share token, transitions to `sent`,
 * builds the share URL + WhatsApp/email deep links. Also sets sent_at +
 * share_channel.
 *
 * Validation:
 *   - Pitch must be in draft status
 *   - Must have at least one talent on the pitch_talents list
 *   - All talents must still be publishable (re-checked here in case
 *     workflow_status changed between draft create and send)
 */
export async function sendPitch(
  supabase: SupabaseClient,
  input: SendPitchInput,
): Promise<PitchResult<SentPitchOutput>> {
  const { data: pitchRow, error: loadErr } = await supabase
    .from("pitches")
    .select("*")
    .eq("id", input.pitchId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (loadErr) return { ok: false, reason: "internal_error", message: loadErr.message };
  if (!pitchRow) return { ok: false, reason: "pitch_not_found" };
  const pitch = pitchRow as PitchRow;
  if (pitch.status !== "draft") return { ok: false, reason: "draft_required" };

  // Confirm at least one publishable talent.
  const { data: talentRows } = await supabase
    .from("pitch_talents")
    .select("talent_profile_id")
    .eq("pitch_id", input.pitchId)
    .eq("tenant_id", input.tenantId);
  const talentIds = (talentRows ?? []).map(
    (r) => (r as { talent_profile_id: string }).talent_profile_id,
  );
  if (talentIds.length === 0) return { ok: false, reason: "no_talents" };

  const stillEligible = await filterPublishableTalentIds(
    supabase,
    input.tenantId,
    talentIds,
  );
  if (stillEligible.length === 0) return { ok: false, reason: "no_talents" };
  // If some talents fell out of publishability between draft and send, drop
  // them silently. The admin gets a count back for transparency via the event.
  if (stillEligible.length < talentIds.length) {
    const dropped = talentIds.filter((id) => !stillEligible.includes(id));
    await supabase
      .from("pitch_talents")
      .delete()
      .eq("pitch_id", input.pitchId)
      .eq("tenant_id", input.tenantId)
      .in("talent_profile_id", dropped);
  }

  // Compute TTL from expires_at if set, else default. The JWT signer
  // clamps to [1h, 30d] internally.
  const ttlSeconds = pitch.expires_at
    ? Math.max(1, Math.floor((new Date(pitch.expires_at).getTime() - Date.now()) / 1000))
    : undefined;

  const signed = signPitchToken(
    {
      tenantId: pitch.tenant_id,
      pitchId: pitch.id,
      shareTokenId: pitch.share_token_id,
      issuerProfileId: input.actorUserId,
    },
    ttlSeconds,
  );

  const { error: upErr } = await supabase
    .from("pitches")
    .update({
      status: "sent",
      share_channel: input.channel,
      sent_at: new Date().toISOString(),
    })
    .eq("id", input.pitchId)
    .eq("tenant_id", input.tenantId);
  if (upErr) return { ok: false, reason: "internal_error", message: upErr.message };

  const baseUrl = process.env.PITCH_PUBLIC_BASE_URL ?? "https://tulala.digital";
  const shareUrl = buildPitchShareUrl(signed.token, baseUrl);
  const agencyName = await loadAgencyName(supabase, pitch.tenant_id);
  const recipient = pitch.recipient_contact ?? {};
  const whatsapp = buildWhatsappDeepLink({
    shareUrl,
    agencyName,
    phone: typeof recipient.phone === "string" ? recipient.phone : null,
  });
  const email = buildEmailDeepLink({
    shareUrl,
    agencyName,
    email: typeof recipient.email === "string" ? recipient.email : null,
  });

  await emitPitchEvent(supabase, {
    tenantId: input.tenantId,
    pitchId: input.pitchId,
    eventType: PITCH_EVENT_TYPES.SENT,
    actorUserId: input.actorUserId,
    actorRole: "staff",
    payload: {
      channel: input.channel,
      talentCount: stillEligible.length,
      expiresAt: signed.expiresAt.toISOString(),
    },
  });

  return {
    ok: true,
    data: {
      pitchId: input.pitchId,
      shareToken: signed.token,
      shareUrl,
      expiresAt: signed.expiresAt,
      whatsappDeepLink: whatsapp,
      emailDeepLink: email,
    },
  };
}

async function loadAgencyName(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string> {
  const { data } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();
  const name = (data as { name?: string } | null)?.name?.trim();
  return name && name.length > 0 ? name : "your agency";
}

/**
 * Cancel a pitch. Sets status=cancelled, stamps cancelled_at, and rotates
 * share_token_id so any outstanding share tokens are immediately revoked.
 * Idempotent — calling on an already-cancelled pitch is a no-op.
 */
export async function cancelPitch(
  supabase: SupabaseClient,
  args: { tenantId: string; pitchId: string; actorUserId: string },
): Promise<PitchResult<void>> {
  const { data: existing } = await supabase
    .from("pitches")
    .select("id, status")
    .eq("id", args.pitchId)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  if (!existing) return { ok: false, reason: "pitch_not_found" };
  const status = (existing as { status: string }).status;
  if (status === "cancelled") return { ok: true, data: undefined };
  if (status === "converted") return { ok: false, reason: "already_converted" };

  // Rotate share_token_id so any outstanding tokens are revoked immediately.
  // We do it client-side (rather than via gen_random_uuid() in SQL) to keep
  // the engine portable for tests that mock the Supabase client.
  const { randomUUID } = await import("node:crypto");
  const { error: upErr } = await supabase
    .from("pitches")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      share_token_id: randomUUID(),
    })
    .eq("id", args.pitchId)
    .eq("tenant_id", args.tenantId);
  if (upErr) return { ok: false, reason: "internal_error", message: upErr.message };

  await emitPitchEvent(supabase, {
    tenantId: args.tenantId,
    pitchId: args.pitchId,
    eventType: PITCH_EVENT_TYPES.CANCELLED,
    actorUserId: args.actorUserId,
    actorRole: "staff",
  });
  return { ok: true, data: undefined };
}

/**
 * Record a public view. Bumps view_count, sets first_viewed_at on first
 * view, and last_viewed_at every time. Transitions sent → viewed on
 * first view.
 */
export async function recordPitchView(
  supabase: SupabaseClient,
  args: { token: string; viewerUserId?: string | null },
): Promise<PitchResult<void>> {
  const loaded = await loadPitchByToken(supabase, args.token);
  if (!loaded.ok) return loaded;
  const pitch = loaded.data;
  // Skip view tracking on terminal pitches — admin already saw the outcome.
  if (
    pitch.status === "converted" ||
    pitch.status === "declined"
  ) {
    return { ok: true, data: undefined };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    last_viewed_at: now,
    view_count: pitch.view_count + 1,
  };
  if (!pitch.first_viewed_at) updates.first_viewed_at = now;
  if (pitch.status === "sent") updates.status = "viewed";

  await supabase
    .from("pitches")
    .update(updates)
    .eq("id", pitch.id)
    .eq("tenant_id", pitch.tenant_id);

  await emitPitchEvent(supabase, {
    tenantId: pitch.tenant_id,
    pitchId: pitch.id,
    eventType: PITCH_EVENT_TYPES.VIEWED,
    actorUserId: args.viewerUserId ?? null,
    actorRole: args.viewerUserId ? "recipient" : "guest",
    payload: { viewCount: pitch.view_count + 1 },
  });

  return { ok: true, data: undefined };
}

/**
 * Recipient prunes a talent from the pitch via the public landing.
 * Marks `removed_by_client_at` rather than deleting the row so the admin
 * can see the diff in the timeline.
 */
export async function removeTalentFromPitch(
  supabase: SupabaseClient,
  args: {
    token: string;
    talentProfileId: string;
    viewerUserId?: string | null;
  },
): Promise<PitchResult<void>> {
  const loaded = await loadPitchByToken(supabase, args.token);
  if (!loaded.ok) return loaded;
  const pitch = loaded.data;
  if (pitch.status !== "sent" && pitch.status !== "viewed" && pitch.status !== "edited") {
    return { ok: false, reason: "invalid_status_transition" };
  }

  const now = new Date().toISOString();
  const { data: rows, error: upErr } = await supabase
    .from("pitch_talents")
    .update({ removed_by_client_at: now })
    .eq("pitch_id", pitch.id)
    .eq("tenant_id", pitch.tenant_id)
    .eq("talent_profile_id", args.talentProfileId)
    .is("removed_by_client_at", null)
    .select("id");
  if (upErr) return { ok: false, reason: "internal_error", message: upErr.message };
  // If no row was updated, the talent isn't on the pitch (or was already
  // removed). Treat as no-op.
  if (!rows || rows.length === 0) return { ok: true, data: undefined };

  if (pitch.status !== "edited") {
    await supabase
      .from("pitches")
      .update({ status: "edited" })
      .eq("id", pitch.id)
      .eq("tenant_id", pitch.tenant_id);
  }

  await emitPitchEvent(supabase, {
    tenantId: pitch.tenant_id,
    pitchId: pitch.id,
    eventType: PITCH_EVENT_TYPES.TALENT_REMOVED,
    actorUserId: args.viewerUserId ?? null,
    actorRole: args.viewerUserId ? "recipient" : "guest",
    payload: { talentProfileId: args.talentProfileId },
  });

  return { ok: true, data: undefined };
}

/**
 * Recipient explicitly declines the pitch. Terminal status — no further
 * actions allowed. Admin can re-pitch with a new row.
 */
export async function declinePitch(
  supabase: SupabaseClient,
  args: { token: string; viewerUserId?: string | null; reason?: string | null },
): Promise<PitchResult<void>> {
  const loaded = await loadPitchByToken(supabase, args.token);
  if (!loaded.ok) return loaded;
  const pitch = loaded.data;
  if (pitch.status === "converted") {
    return { ok: false, reason: "already_converted" };
  }
  if (pitch.status === "declined") {
    return { ok: true, data: undefined };
  }

  const { error: upErr } = await supabase
    .from("pitches")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
    })
    .eq("id", pitch.id)
    .eq("tenant_id", pitch.tenant_id);
  if (upErr) return { ok: false, reason: "internal_error", message: upErr.message };

  await emitPitchEvent(supabase, {
    tenantId: pitch.tenant_id,
    pitchId: pitch.id,
    eventType: PITCH_EVENT_TYPES.DECLINED,
    actorUserId: args.viewerUserId ?? null,
    actorRole: args.viewerUserId ? "recipient" : "guest",
    payload: args.reason ? { reason: args.reason } : {},
  });

  return { ok: true, data: undefined };
}

/**
 * Convert the pitch into a real inquiry by calling submitInquiry with
 * `source_channel: 'pitch'` + `source_pitch_id` set on the inquiry.
 *
 * Idempotent: if the pitch is already converted (status='converted' AND
 * converted_inquiry_id is set), returns the existing inquiry id without
 * creating a new one. This protects against double-click submission.
 *
 * Trust bypass: per the spec, pitch-converted inquiries skip talent
 * contact policy checks. We log this as a `pitch_curated_override` event
 * for audit. (The actual policy check is downstream in submitInquiry's
 * environment; we don't add an explicit bypass flag here because the
 * contact-policy gate isn't yet implemented in submitInquiry. When it
 * lands, it should check `source_channel === 'pitch'` and skip.)
 */
export async function convertPitchToInquiry(
  supabase: SupabaseClient,
  input: ConvertPitchInput,
): Promise<PitchResult<ConvertedPitchOutput>> {
  const loaded = await loadPitchByToken(supabase, input.token);
  if (!loaded.ok) return loaded;
  const pitch = loaded.data;

  // Idempotency: already converted → return existing inquiry id.
  if (pitch.status === "converted" && pitch.converted_inquiry_id) {
    return {
      ok: true,
      data: { inquiryId: pitch.converted_inquiry_id, pitchId: pitch.id },
    };
  }
  if (pitch.status === "declined" || pitch.status === "cancelled") {
    return { ok: false, reason: "invalid_status_transition" };
  }

  // Resolve the talent list — only those NOT removed by the client.
  const { data: talentRows } = await supabase
    .from("pitch_talents")
    .select("talent_profile_id")
    .eq("pitch_id", pitch.id)
    .eq("tenant_id", pitch.tenant_id)
    .is("removed_by_client_at", null);
  const talentIds = (talentRows ?? []).map(
    (r) => (r as { talent_profile_id: string }).talent_profile_id,
  );
  if (talentIds.length === 0) return { ok: false, reason: "no_talents" };

  // Resolve recipient contact: prefer the live contactInfo from the form,
  // fall back to recipient_contact stored on the pitch.
  const stored = pitch.recipient_contact ?? {};
  const fromForm = input.contactInfo ?? {};
  const contactName =
    fromForm.name?.trim() ||
    (typeof stored.name === "string" ? stored.name : null) ||
    null;
  const contactEmail =
    fromForm.email?.trim() ||
    (typeof stored.email === "string" ? stored.email : null) ||
    null;
  const contactPhone =
    fromForm.phone?.trim() ||
    (typeof stored.phone === "string" ? stored.phone : null) ||
    null;
  const company =
    fromForm.company?.trim() ||
    (typeof stored.company === "string" ? stored.company : null) ||
    null;
  const message =
    fromForm.message?.trim() ||
    (pitch.personal_note ? `(via pitch) ${pitch.personal_note}` : null) ||
    null;

  if (!contactName || !contactEmail) {
    return {
      ok: false,
      reason: "validation_failed",
      message: "Contact name and email are required.",
    };
  }

  const clientUserId = input.recipientUserId ?? pitch.recipient_user_id;

  // Actor for submitInquiry — for guest conversions, use the pitch creator
  // as the actor (so the inquiry is attributed to the agency staff, not to
  // an anonymous source). For signed-in conversions, use the recipient.
  const actorUserId = clientUserId ?? pitch.created_by_user_id;
  if (!actorUserId) {
    return {
      ok: false,
      reason: "internal_error",
      message: "No actor available to attribute this inquiry.",
    };
  }

  const brief = pitch.brief ?? {};
  const inquiryResult = await submitInquiry(supabase, {
    tenant_id: pitch.tenant_id,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    company,
    event_date: typeof brief.event_date === "string" ? brief.event_date : null,
    event_location:
      typeof brief.event_location === "string" ? brief.event_location : null,
    event_type_id:
      typeof brief.event_type_id === "string" ? brief.event_type_id : null,
    message,
    source_channel: "pitch",
    source_page: `pitch:${pitch.id}`,
    client_user_id: clientUserId,
    talent_profile_ids: talentIds,
    actorUserId,
    trust_level_at_submission: clientUserId ? null : "basic",
  });

  if (!inquiryResult.success) {
    return {
      ok: false,
      reason: "internal_error",
      message:
        ("error" in inquiryResult ? inquiryResult.error : undefined) ??
        ("reason" in inquiryResult ? inquiryResult.reason : undefined) ??
        "submitInquiry_failed",
    };
  }
  const inquiryId = inquiryResult.data?.inquiryId;
  if (!inquiryId) {
    return {
      ok: false,
      reason: "internal_error",
      message: "submitInquiry returned no inquiry id",
    };
  }

  // Stamp the inquiry → pitch lineage.
  await supabase
    .from("inquiries")
    .update({ source_pitch_id: pitch.id })
    .eq("id", inquiryId);

  // Stamp the pitch → inquiry lineage + transition to converted.
  await supabase
    .from("pitches")
    .update({
      status: "converted",
      converted_inquiry_id: inquiryId,
      converted_at: new Date().toISOString(),
    })
    .eq("id", pitch.id)
    .eq("tenant_id", pitch.tenant_id);

  await emitPitchEvent(supabase, {
    tenantId: pitch.tenant_id,
    pitchId: pitch.id,
    eventType: PITCH_EVENT_TYPES.CONVERTED,
    actorUserId: clientUserId ?? null,
    actorRole: clientUserId ? "recipient" : "guest",
    payload: { inquiryId, talentCount: talentIds.length },
  });
  // Audit-only marker for the trust bypass — kept distinct so reports can
  // count how many pitch-converted inquiries skipped the contact policy.
  await emitPitchEvent(supabase, {
    tenantId: pitch.tenant_id,
    pitchId: pitch.id,
    eventType: PITCH_EVENT_TYPES.TRUST_BYPASS,
    actorUserId: pitch.created_by_user_id ?? null,
    actorRole: "system",
    payload: { inquiryId },
  });

  return { ok: true, data: { inquiryId, pitchId: pitch.id } };
}
