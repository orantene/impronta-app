"use server";

/**
 * Talent-side pipeline server actions for the prototype talent shell.
 *
 * Mirrors the structure of `web/src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts`
 * but with talent-friendly auth: the actor is any authenticated user, and
 * the engine validates permission internally (talent participant on the
 * inquiry).
 *
 * All wrappers translate `EngineResult` to a flat `{ ok, error }` shape
 * for client consumption.
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  acceptTalentInvitation,
  declineTalentInvitation,
} from "@/lib/inquiry/inquiry-engine-roster";
import {
  submitTalentRate,
} from "@/lib/inquiry/inquiry-engine-offers";
import {
  talentRespondToOffer,
} from "@/lib/inquiry/inquiry-engine-approvals";

// A.4 INTENTIONAL DIVERGENCE: align with canonical `ServerActionResult<T>` — currently kept
// as a structurally compatible local type so `withInquiryContext` can return
// `TalentActionResult & { data?: T }` without restructuring every caller.
// Convert once the pipeline data-payload story is unified across all wrappers.
export type TalentActionResult = { ok: true } | { ok: false; error: string };

async function withInquiryContext<T>(
  inquiryId: string,
  fn: (ctx: {
    supabase: import("@supabase/supabase-js").SupabaseClient;
    userId: string;
    tenantId: string;
    inquiryVersion: number;
  }) => Promise<T>,
): Promise<TalentActionResult & { data?: T }> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("tenant_id, version")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found." };

    const data = await fn({
      supabase,
      userId: user.id,
      tenantId: inq.tenant_id as string,
      inquiryVersion: (inq.version as number | null) ?? 1,
    });
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    logServerError("talent-pipeline.withInquiryContext", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Talent accepts a roster invitation for an inquiry.
 * Engine: `acceptTalentInvitation` — flips the participant row to active.
 */
export async function acceptInquiryInvitation(inquiryId: string): Promise<TalentActionResult> {
  const result = await withInquiryContext(inquiryId, async ({ supabase, userId, tenantId, inquiryVersion }) => {
    const r = await acceptTalentInvitation(supabase, {
      inquiryId,
      tenantId,
      actorUserId: userId,
      expectedVersion: inquiryVersion,
    });
    if (!r.success) {
      throw new Error(
        (r as { reason?: string; error?: string }).reason
        ?? (r as { error?: string }).error
        ?? "Could not accept.",
      );
    }
  });
  return result.ok ? { ok: true } : result;
}

/**
 * Talent approves (or rejects) the active offer on an inquiry.
 *
 * Talent-side counterpart to the client's `clientAcceptOffer`. An offer only
 * converts to a booking once EVERY party (client + each assigned talent) has
 * accepted; before this existed the talent had no UI path to record their
 * approval, so any offer with an assigned talent dead-ended at
 * "awaiting talent" forever. Resolves the inquiry's current/sent offer, then
 * delegates to the engine, which flips the talent's `inquiry_approvals` row
 * and — once all parties are in — advances the inquiry to `approved`.
 */
export async function respondToInquiryOffer(
  inquiryId: string,
  decision: "accepted" | "rejected",
): Promise<TalentActionResult> {
  const result = await withInquiryContext(inquiryId, async ({ supabase, userId, tenantId, inquiryVersion }) => {
    // Offer resolution (current pointer → latest SENT) lives in the engine so
    // this server action stays free of raw tenant-scoped reads.
    const r = await talentRespondToOffer(supabase, {
      inquiryId,
      tenantId,
      actorUserId: userId,
      expectedVersion: inquiryVersion,
      decision,
    });
    if (!r.success) {
      const reason = (r as { reason?: string; error?: string }).reason
        ?? (r as { error?: string }).error
        ?? "Could not record your response.";
      throw new Error(
        reason === "version_conflict" ? "Something changed since you opened this. Refresh and try again."
        : reason === "forbidden" ? "You don't have permission to respond to this offer."
        : reason === "no_active_offer" ? "There's no active offer to respond to."
        : reason === "no_talent_participant" ? "You're not assigned to this offer."
        : reason,
      );
    }
  });
  return result.ok ? { ok: true } : result;
}

/**
 * Talent declines a roster invitation. Optional `reason` for the
 * coordinator's audit trail.
 */
export async function declineInquiryInvitation(
  inquiryId: string,
  reason?: string,
): Promise<TalentActionResult> {
  const result = await withInquiryContext(inquiryId, async ({ supabase, userId, tenantId, inquiryVersion }) => {
    const r = await declineTalentInvitation(supabase, {
      inquiryId,
      tenantId,
      actorUserId: userId,
      expectedVersion: inquiryVersion,
      declineReason: reason ?? null,
    });
    if (!r.success) {
      throw new Error(
        (r as { reason?: string; error?: string }).reason
        ?? (r as { error?: string }).error
        ?? "Could not decline.",
      );
    }
  });
  return result.ok ? { ok: true } : result;
}

/**
 * Convenience wrapper — talent submits their rate on an inquiry without
 * having to know the offer/line-item ids ahead of time. Looks up the
 * current offer + the line item that targets this talent's profile, then
 * delegates to the engine.
 *
 * Returns "no_my_line_item" if the inquiry's current offer doesn't have
 * a line item for this talent (the coordinator hasn't sketched a row yet).
 */
export async function submitMyRateForInquiry(
  inquiryId: string,
  talentCost: number,
): Promise<TalentActionResult> {
  if (!Number.isFinite(talentCost) || talentCost < 0) {
    return { ok: false, error: "Rate must be a positive number." };
  }
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    // Resolve the talent's profile from the auth user.
    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!tp) return { ok: false, error: "No talent profile linked to your account." };

    // Resolve the inquiry + its current offer.
    const { data: inq } = await supabase
      .from("inquiries")
      .select("tenant_id, version, current_offer_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found." };
    if (!inq.current_offer_id) return { ok: false, error: "No active offer on this inquiry yet." };

    // Find the line item that targets this talent.
    const { data: line } = await supabase
      .from("inquiry_offer_line_items")
      .select("id")
      .eq("offer_id", inq.current_offer_id)
      .eq("talent_profile_id", tp.id)
      .maybeSingle();
    if (!line) return { ok: false, error: "The coordinator hasn't added you to the offer yet." };

    return submitMyRate(
      inquiryId,
      inq.current_offer_id as string,
      line.id as string,
      talentCost,
    );
  } catch (err) {
    logServerError("talent-pipeline.submitMyRateForInquiry", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Talent sends a message into the inquiry's group thread. Bypasses the
 * staff-capability gate that admin's `sendMessage` uses — instead we
 * verify the actor is a talent participant on the inquiry.
 *
 * thread_type defaults to "group" (the talent-thread). Internal/private
 * threads aren't accessible from the talent surface.
 */
export async function sendInquiryMessageAsTalent(
  inquiryId: string,
  body: string,
): Promise<TalentActionResult> {
  try {
    const trimmed = body.trim();
    if (!trimmed) return { ok: false, error: "Message body is empty." };
    if (trimmed.length > 10000) return { ok: false, error: "Message too long." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    // Resolve inquiry tenant + verify talent participant.
    const { data: inq } = await supabase
      .from("inquiries")
      .select("tenant_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found." };

    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!tp) return { ok: false, error: "No talent profile linked to your account." };

    const { data: participant } = await supabase
      .from("inquiry_participants")
      .select("id, status")
      .eq("inquiry_id", inquiryId)
      .eq("tenant_id", inq.tenant_id as string)
      .eq("talent_profile_id", tp.id)
      .eq("role", "talent")
      .maybeSingle();
    if (!participant) return { ok: false, error: "You're not on this inquiry." };
    if (participant.status === "removed" || participant.status === "declined") {
      return { ok: false, error: "You're no longer on this inquiry." };
    }

    const { error } = await supabase
      .from("inquiry_messages")
      .insert({
        inquiry_id: inquiryId,
        thread_type: "group",
        sender_user_id: user.id,
        body: trimmed,
        tenant_id: inq.tenant_id as string,
      });
    if (error) {
      logServerError("talent-pipeline.sendInquiryMessageAsTalent", error);
      return { ok: false, error: "Failed to send message." };
    }

    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("talent-pipeline.sendInquiryMessageAsTalent", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Talent submits their rate on an offer line item. Wraps the engine
 * `submitTalentRate` with full permission + version + activity-log.
 */
export async function submitMyRate(
  inquiryId: string,
  offerId: string,
  lineItemId: string,
  talentCost: number,
): Promise<TalentActionResult> {
  if (!Number.isFinite(talentCost) || talentCost < 0) {
    return { ok: false, error: "Rate must be a positive number." };
  }
  const result = await withInquiryContext(inquiryId, async ({ supabase, userId, tenantId }) => {
    const r = await submitTalentRate(supabase, {
      inquiryId,
      tenantId,
      offerId,
      lineItemId,
      actorUserId: userId,
      talentCost,
    });
    if (!r.success) {
      const reason = (r as { reason?: string; error?: string }).reason
        ?? (r as { error?: string }).error
        ?? "Could not submit rate.";
      throw new Error(
        reason === "forbidden" ? "You can only submit a rate on your own line item."
        : reason === "offer_not_editable" ? "This offer is locked — wait for a counter."
        : reason === "line_item_not_found" ? "Line item not found."
        : reason === "invalid_rate" ? "Rate must be a positive number."
        : reason,
      );
    }
  });
  return result.ok ? { ok: true } : result;
}

/**
 * Talent counters a SENT offer — proposes a different rate.
 *
 * `submitMyRate` only works while the offer is `status='draft'`. Once the
 * coordinator sends the offer to the client, the engine locks line-item
 * edits. But the talent still needs a way to say "I'd want 1200 not
 * 1000" so the coordinator can re-draft.
 *
 * v1 approach (B7): send a tagged `[Counter request]` message into the
 * talent-group thread with the proposed rate + optional note. Coordinator
 * sees it in the thread, drafts a new offer via the standard
 * `counterOffer` engine path (which creates a fresh draft from the
 * accepted-or-sent offer's snapshot).
 *
 * The engine `counterOffer` path is workspace-side; the talent doesn't
 * directly drive it. This keeps the workspace as authority over the
 * offer document — the talent just signals intent.
 *
 * No engine mutation in this action — just a tagged message. Audit
 * trail comes through the standard `inquiry_messages` write path.
 */
export async function submitMyCounterRate(
  inquiryId: string,
  proposedRate: number,
  note?: string | null,
): Promise<TalentActionResult> {
  if (!Number.isFinite(proposedRate) || proposedRate < 0) {
    return { ok: false, error: "Rate must be a positive number." };
  }
  // Compose the tagged message body. Coordinator-side UI parses the
  // `[Counter request]` prefix to surface the counter on the offer card.
  const noteSegment = note?.trim() ? ` — ${note.trim()}` : "";
  const body = `[Counter request] Proposed rate: ${proposedRate}${noteSegment}`;
  return sendInquiryMessageAsTalent(inquiryId, body);
}

/**
 * Upload a file to the inquiry-files bucket on behalf of a talent participant.
 * Mirrors `uploadInquiryAttachment` in `_pipeline-actions.ts` but uses
 * participant-role gating instead of staff capability:
 *   1. Verify the caller has an active talent_profile linked to their account.
 *   2. Verify that talent_profile is an active participant on this inquiry.
 *   3. Use the service-role client for the storage + metadata write so the
 *      bucket RLS (which gates on staff membership) doesn't block talent.
 *
 * Resulting attachment row has visibility="participant" so staff + talent
 * can both see it; the client thread stays clean.
 */
export async function uploadInquiryAttachmentAsTalent(
  formData: FormData,
): Promise<TalentActionResult & { data?: { attachmentId: string } }> {
  try {
    const inquiryId = String(formData.get("inquiryId") ?? "");
    const description = String(formData.get("description") ?? "").trim() || null;
    const file = formData.get("file");

    if (!inquiryId) return { ok: false, error: "Missing inquiryId." };
    if (!(file instanceof File)) return { ok: false, error: "No file uploaded." };
    if (file.size === 0) return { ok: false, error: "File is empty." };
    if (file.size > 100 * 1024 * 1024) return { ok: false, error: "File exceeds 100 MB cap." };

    const supabase = await createSupabaseServerClient();
    if (!supabase) return { ok: false, error: "Database unavailable." };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };

    const { data: inq } = await supabase
      .from("inquiries")
      .select("id, tenant_id")
      .eq("id", inquiryId)
      .maybeSingle();
    if (!inq) return { ok: false, error: "Inquiry not found." };
    const tenantId = inq.tenant_id as string;

    const { data: tp } = await supabase
      .from("talent_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!tp) return { ok: false, error: "No talent profile linked to your account." };

    const { data: participant } = await supabase
      .from("inquiry_participants")
      .select("id, status")
      .eq("inquiry_id", inquiryId)
      .eq("tenant_id", tenantId)
      .eq("talent_profile_id", tp.id)
      .eq("role", "talent")
      .maybeSingle();
    if (!participant) return { ok: false, error: "You're not on this inquiry." };
    if (participant.status === "removed" || participant.status === "declined") {
      return { ok: false, error: "You're no longer an active participant on this inquiry." };
    }

    // Service-role client bypasses storage bucket RLS (which gates on staff).
    // Participation was validated above — this is a trusted server-side write.
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Storage unavailable." };

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const objectId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const storagePath = `${tenantId}/${inquiryId}/${objectId}-${safeName}`;

    const { error: uploadErr } = await admin
      .storage
      .from("inquiry-files")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (uploadErr) {
      logServerError("talent-pipeline.uploadInquiryAttachmentAsTalent/storage", uploadErr);
      return { ok: false, error: `Upload failed: ${uploadErr.message}` };
    }

    const { data: row, error: insertErr } = await admin
      .from("inquiry_attachments")
      .insert({
        tenant_id: tenantId,
        inquiry_id: inquiryId,
        uploaded_by: user.id,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type || null,
        byte_size: file.size,
        description,
        visibility: "participant",
      })
      .select("id")
      .single();

    if (insertErr || !row) {
      await admin.storage.from("inquiry-files").remove([storagePath]);
      logServerError("talent-pipeline.uploadInquiryAttachmentAsTalent/insert", insertErr);
      return { ok: false, error: "Could not save file metadata." };
    }

    revalidatePath("/", "layout");
    return { ok: true, data: { attachmentId: row.id as string } };
  } catch (err) {
    logServerError("talent-pipeline.uploadInquiryAttachmentAsTalent", err);
    return { ok: false, error: "Unexpected error." };
  }
}
