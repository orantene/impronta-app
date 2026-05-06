"use server";

// Phase 3.12 / Messages — Slice B server actions for the right pane:
// lineup management, offer lifecycle, attachments, payment surface.
//
// All actions are tenant-scoped via getTenantScopeBySlug + capability gate
// agency.workspace.view (or stricter where noted).

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { logServerError } from "@/lib/server/safe-error";
import { revalidatePath } from "next/cache";

type ActionResult<T> = { ok: true; data?: T } | { ok: false; error: string };

// ─── Gate helper ──────────────────────────────────────────────────────────────

type GateResult =
  | { ok: false; error: string }
  | { ok: true;
      scope: NonNullable<Awaited<ReturnType<typeof getTenantScopeBySlug>>>;
      supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>> };

async function gateAndClient(
  tenantSlug: string,
  capability: "agency.workspace.view" | "agency.workspace.edit" = "agency.workspace.view",
): Promise<GateResult> {
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { ok: false, error: "Workspace not found." };
  const can = await userHasCapability(capability, scope.tenantId);
  if (!can) return { ok: false, error: "Not authorised." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };
  return { ok: true, scope, supabase };
}

async function currentUserId(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>) {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function inquiryBelongsToTenant(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  tenantId: string,
  inquiryId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("inquiries")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", inquiryId)
    .maybeSingle();
  return Boolean(data);
}

function refreshMessages(tenantSlug: string, inquiryId?: string) {
  revalidatePath(`/${tenantSlug}/admin/messages`);
  if (inquiryId) {
    revalidatePath(`/${tenantSlug}/admin/messages?inquiry=${inquiryId}`);
  }
}

// ─── Lineup actions ───────────────────────────────────────────────────────────

/**
 * Add a talent to an inquiry's lineup.
 * Idempotent: if the talent already has a non-removed participant row,
 * we surface that as a no-op (still ok=true).
 */
export async function addLineupParticipant(
  tenantSlug: string,
  inquiryId: string,
  talentProfileId: string,
): Promise<ActionResult<{ participantId: string }>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    if (!(await inquiryBelongsToTenant(r.supabase, r.scope.tenantId, inquiryId))) {
      return { ok: false, error: "Inquiry not found in this workspace." };
    }

    // Existing non-removed row?
    const { data: existing } = await r.supabase
      .from("inquiry_participants")
      .select("id, removed_at")
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .eq("talent_profile_id", talentProfileId)
      .is("removed_at", null)
      .maybeSingle();

    if (existing) {
      refreshMessages(tenantSlug, inquiryId);
      return { ok: true, data: { participantId: (existing as { id: string }).id } };
    }

    const me = await currentUserId(r.supabase);

    // Resolve user_id from talent_profiles.user_id (talent has claimed account).
    const { data: tpRow } = await r.supabase
      .from("talent_profiles")
      .select("user_id")
      .eq("id", talentProfileId)
      .maybeSingle();
    const userId = (tpRow as { user_id: string | null } | null)?.user_id ?? null;

    // Find next sort_order.
    const { data: maxRow } = await r.supabase
      .from("inquiry_participants")
      .select("sort_order")
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSort = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1;

    const { data: inserted, error } = await r.supabase
      .from("inquiry_participants")
      .insert({
        tenant_id: r.scope.tenantId,
        inquiry_id: inquiryId,
        talent_profile_id: talentProfileId,
        user_id: userId,
        role: "talent",
        status: "pending",
        sort_order: nextSort,
        added_by_user_id: me,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      logServerError("messages.addLineupParticipant", error);
      return { ok: false, error: "Could not add talent to lineup." };
    }

    refreshMessages(tenantSlug, inquiryId);
    return { ok: true, data: { participantId: (inserted as { id: string }).id } };
  } catch (err) {
    logServerError("messages.addLineupParticipant", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Remove a participant (soft-delete via removed_at). */
export async function removeLineupParticipant(
  tenantSlug: string,
  inquiryId: string,
  participantId: string,
): Promise<ActionResult<null>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    const me = await currentUserId(r.supabase);

    const { error } = await r.supabase
      .from("inquiry_participants")
      .update({
        status: "removed",
        removed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        added_by_user_id: me,
      })
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .eq("id", participantId);

    if (error) {
      logServerError("messages.removeLineupParticipant", error);
      return { ok: false, error: "Could not remove from lineup." };
    }

    refreshMessages(tenantSlug, inquiryId);
    return { ok: true };
  } catch (err) {
    logServerError("messages.removeLineupParticipant", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Manually set a participant's status (admin override). */
export async function setLineupParticipantStatus(
  tenantSlug: string,
  inquiryId: string,
  participantId: string,
  newStatus: "pending" | "accepted" | "declined",
  declineReasonText?: string,
): Promise<ActionResult<null>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    const update: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (newStatus === "accepted") update.accepted_at = new Date().toISOString();
    if (newStatus === "declined") {
      update.decline_reason = "admin_override";
      if (declineReasonText) update.decline_reason_text = declineReasonText;
    }

    const { error } = await r.supabase
      .from("inquiry_participants")
      .update(update)
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .eq("id", participantId);

    if (error) {
      logServerError("messages.setLineupParticipantStatus", error);
      return { ok: false, error: "Could not update participant." };
    }

    refreshMessages(tenantSlug, inquiryId);
    return { ok: true };
  } catch (err) {
    logServerError("messages.setLineupParticipantStatus", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Offer actions ────────────────────────────────────────────────────────────

/** Mark a draft offer as sent. Updates inquiry.next_action_by → "client". */
export async function sendOffer(
  tenantSlug: string,
  inquiryId: string,
  offerId: string,
): Promise<ActionResult<null>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    const { error: offerErr } = await r.supabase
      .from("inquiry_offers")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .eq("id", offerId)
      .eq("status", "draft");

    if (offerErr) {
      logServerError("messages.sendOffer.offer", offerErr);
      return { ok: false, error: "Could not send offer." };
    }

    // Move inquiry into offer_pending state.
    const { error: inquiryErr } = await r.supabase
      .from("inquiries")
      .update({
        status: "offer_pending",
        next_action_by: "client",
        current_offer_id: offerId,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", r.scope.tenantId)
      .eq("id", inquiryId);

    if (inquiryErr) {
      logServerError("messages.sendOffer.inquiry", inquiryErr);
    }

    refreshMessages(tenantSlug, inquiryId);
    return { ok: true };
  } catch (err) {
    logServerError("messages.sendOffer", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Mark a sent offer as accepted (admin override — usually client triggers). */
export async function markOfferAccepted(
  tenantSlug: string,
  inquiryId: string,
  offerId: string,
): Promise<ActionResult<null>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    const { error: offerErr } = await r.supabase
      .from("inquiry_offers")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .eq("id", offerId);

    if (offerErr) {
      logServerError("messages.markOfferAccepted.offer", offerErr);
      return { ok: false, error: "Could not accept offer." };
    }

    const { error: inquiryErr } = await r.supabase
      .from("inquiries")
      .update({
        status: "approved",
        next_action_by: "coordinator",
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", r.scope.tenantId)
      .eq("id", inquiryId);
    if (inquiryErr) logServerError("messages.markOfferAccepted.inquiry", inquiryErr);

    refreshMessages(tenantSlug, inquiryId);
    return { ok: true };
  } catch (err) {
    logServerError("messages.markOfferAccepted", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Mark an offer as rejected (with optional client-message reason). */
export async function markOfferRejected(
  tenantSlug: string,
  inquiryId: string,
  offerId: string,
  reasonText?: string,
): Promise<ActionResult<null>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    const { error: offerErr } = await r.supabase
      .from("inquiry_offers")
      .update({
        status: "rejected",
        rejection_reason: "client_declined",
        rejection_reason_text: reasonText ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .eq("id", offerId);

    if (offerErr) {
      logServerError("messages.markOfferRejected.offer", offerErr);
      return { ok: false, error: "Could not mark rejected." };
    }

    const { error: inquiryErr } = await r.supabase
      .from("inquiries")
      .update({
        status: "coordination",
        next_action_by: "coordinator",
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", r.scope.tenantId)
      .eq("id", inquiryId);
    if (inquiryErr) logServerError("messages.markOfferRejected.inquiry", inquiryErr);

    refreshMessages(tenantSlug, inquiryId);
    return { ok: true };
  } catch (err) {
    logServerError("messages.markOfferRejected", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Create a new draft offer version: clones the current offer + its line items
 * with version+1 and status=draft. Used for "Revise offer" flow.
 */
export async function reviseOffer(
  tenantSlug: string,
  inquiryId: string,
  baseOfferId: string,
): Promise<ActionResult<{ offerId: string }>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    const { data: baseRow, error: baseErr } = await r.supabase
      .from("inquiry_offers")
      .select(`id, version, total_client_price, coordinator_fee, currency_code, notes, valid_until`)
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .eq("id", baseOfferId)
      .maybeSingle();

    if (baseErr || !baseRow) {
      logServerError("messages.reviseOffer.base", baseErr);
      return { ok: false, error: "Base offer not found." };
    }

    const me = await currentUserId(r.supabase);

    const { data: newOffer, error: newErr } = await r.supabase
      .from("inquiry_offers")
      .insert({
        tenant_id: r.scope.tenantId,
        inquiry_id: inquiryId,
        version: (baseRow as { version: number }).version + 1,
        status: "draft",
        total_client_price: (baseRow as { total_client_price: number | null }).total_client_price,
        coordinator_fee:    (baseRow as { coordinator_fee: number | null }).coordinator_fee,
        currency_code:      (baseRow as { currency_code: string }).currency_code,
        notes:              (baseRow as { notes: string | null }).notes,
        valid_until:        (baseRow as { valid_until: string | null }).valid_until,
        created_by_user_id: me,
      })
      .select("id")
      .single();

    if (newErr || !newOffer) {
      logServerError("messages.reviseOffer.insert", newErr);
      return { ok: false, error: "Could not create revised offer." };
    }

    const newOfferId = (newOffer as { id: string }).id;

    // Clone line items.
    const { data: lineRows } = await r.supabase
      .from("inquiry_offer_line_items")
      .select("talent_profile_id, label, pricing_unit, units, unit_price, total_price, talent_cost, notes, sort_order")
      .eq("tenant_id", r.scope.tenantId)
      .eq("offer_id", baseOfferId);

    if (lineRows && lineRows.length > 0) {
      const inserts = (lineRows as Array<{
        talent_profile_id: string | null;
        label: string;
        pricing_unit: string;
        units: number;
        unit_price: number;
        total_price: number;
        talent_cost: number | null;
        notes: string | null;
        sort_order: number;
      }>).map((li) => ({
        tenant_id: r.scope.tenantId,
        offer_id: newOfferId,
        ...li,
      }));
      const { error: liErr } = await r.supabase.from("inquiry_offer_line_items").insert(inserts);
      if (liErr) logServerError("messages.reviseOffer.lineItems", liErr);
    }

    // Point inquiry's current_offer_id to the new draft.
    const { error: ptrErr } = await r.supabase
      .from("inquiries")
      .update({ current_offer_id: newOfferId, updated_at: new Date().toISOString() })
      .eq("tenant_id", r.scope.tenantId)
      .eq("id", inquiryId);
    if (ptrErr) logServerError("messages.reviseOffer.pointer", ptrErr);

    refreshMessages(tenantSlug, inquiryId);
    return { ok: true, data: { offerId: newOfferId } };
  } catch (err) {
    logServerError("messages.reviseOffer", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * Create a brand-new draft offer for an inquiry from the lineup.
 * Initializes one line item per accepted/pending participant with talent_cost=0.
 */
export async function createInitialOffer(
  tenantSlug: string,
  inquiryId: string,
  currencyCode: string = "USD",
): Promise<ActionResult<{ offerId: string }>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    const me = await currentUserId(r.supabase);

    const { data: existing } = await r.supabase
      .from("inquiry_offers")
      .select("id, version")
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = existing ? (existing as { version: number }).version + 1 : 1;

    const { data: newOffer, error: newErr } = await r.supabase
      .from("inquiry_offers")
      .insert({
        tenant_id: r.scope.tenantId,
        inquiry_id: inquiryId,
        version: nextVersion,
        status: "draft",
        currency_code: currencyCode,
        total_client_price: 0,
        coordinator_fee: 0,
        created_by_user_id: me,
      })
      .select("id")
      .single();

    if (newErr || !newOffer) {
      logServerError("messages.createInitialOffer", newErr);
      return { ok: false, error: "Could not create offer." };
    }

    const newOfferId = (newOffer as { id: string }).id;

    // Seed one line item per active participant (talent role only).
    const { data: parts } = await r.supabase
      .from("inquiry_participants")
      .select("talent_profile_id, role, status")
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .neq("status", "removed");

    if (parts && parts.length > 0) {
      const inserts = (parts as Array<{
        talent_profile_id: string | null; role: string; status: string;
      }>)
        .filter((p) => p.role === "talent" && p.talent_profile_id)
        .map((p, idx) => ({
          tenant_id: r.scope.tenantId,
          offer_id: newOfferId,
          talent_profile_id: p.talent_profile_id,
          label: "Talent fee",
          pricing_unit: "flat",
          units: 1,
          unit_price: 0,
          total_price: 0,
          talent_cost: 0,
          sort_order: idx,
        }));
      if (inserts.length > 0) {
        const { error: liErr } = await r.supabase.from("inquiry_offer_line_items").insert(inserts);
        if (liErr) logServerError("messages.createInitialOffer.lineItems", liErr);
      }
    }

    // Point inquiry to new offer.
    await r.supabase
      .from("inquiries")
      .update({ current_offer_id: newOfferId, updated_at: new Date().toISOString() })
      .eq("tenant_id", r.scope.tenantId)
      .eq("id", inquiryId);

    refreshMessages(tenantSlug, inquiryId);
    return { ok: true, data: { offerId: newOfferId } };
  } catch (err) {
    logServerError("messages.createInitialOffer", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Update a single line item's unit_price/units/talent_cost; recomputes total_price. */
export async function updateOfferLineItem(
  tenantSlug: string,
  offerId: string,
  lineItemId: string,
  patch: Partial<{
    label: string;
    units: number;
    unit_price: number;
    talent_cost: number;
    notes: string;
    pricing_unit: string;
  }>,
): Promise<ActionResult<null>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    // Pull current row to compute total_price if units / unit_price changed.
    const { data: current } = await r.supabase
      .from("inquiry_offer_line_items")
      .select("units, unit_price, offer_id")
      .eq("tenant_id", r.scope.tenantId)
      .eq("id", lineItemId)
      .eq("offer_id", offerId)
      .maybeSingle();
    if (!current) return { ok: false, error: "Line item not found." };

    const cur = current as { units: number; unit_price: number; offer_id: string };
    const units = patch.units ?? Number(cur.units);
    const unitPrice = patch.unit_price ?? Number(cur.unit_price);
    const totalPrice = units * unitPrice;

    const update: Record<string, unknown> = {
      ...patch,
      total_price: totalPrice,
    };

    const { error } = await r.supabase
      .from("inquiry_offer_line_items")
      .update(update)
      .eq("tenant_id", r.scope.tenantId)
      .eq("id", lineItemId);

    if (error) {
      logServerError("messages.updateOfferLineItem", error);
      return { ok: false, error: "Could not update line item." };
    }

    // Recompute offer totals.
    const { data: all } = await r.supabase
      .from("inquiry_offer_line_items")
      .select("total_price")
      .eq("tenant_id", r.scope.tenantId)
      .eq("offer_id", offerId);
    const sum = ((all ?? []) as { total_price: number }[]).reduce(
      (acc, row) => acc + Number(row.total_price ?? 0),
      0,
    );
    await r.supabase
      .from("inquiry_offers")
      .update({ total_client_price: sum, updated_at: new Date().toISOString() })
      .eq("tenant_id", r.scope.tenantId)
      .eq("id", offerId);

    refreshMessages(tenantSlug);
    return { ok: true };
  } catch (err) {
    logServerError("messages.updateOfferLineItem", err);
    return { ok: false, error: "Unexpected error." };
  }
}

// ─── Attachment actions ───────────────────────────────────────────────────────

/**
 * Upload an attachment via FormData (file). Stores in `inquiry-files` bucket
 * at `{tenantId}/{inquiryId}/{uuid}-{filename}` and inserts metadata row.
 */
export async function uploadInquiryAttachment(
  tenantSlug: string,
  inquiryId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, error: "No file provided." };
    if (file.size === 0)        return { ok: false, error: "Empty file." };
    if (file.size > 100 * 1024 * 1024) return { ok: false, error: "File too large (100MB max)." };

    if (!(await inquiryBelongsToTenant(r.supabase, r.scope.tenantId, inquiryId))) {
      return { ok: false, error: "Inquiry not found." };
    }

    const me = await currentUserId(r.supabase);
    if (!me) return { ok: false, error: "Not authenticated." };

    const description = (formData.get("description") as string | null) ?? null;
    const visibility = (formData.get("visibility") as string | null) === "shared"
      ? "shared" : "staff";

    const uuidPart = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${r.scope.tenantId}/${inquiryId}/${uuidPart}-${safeName}`;

    // Upload via service role to bypass storage policies cleanly during SSR.
    const admin = createServiceRoleClient();
    const storageClient = admin ?? r.supabase;
    const { error: uploadErr } = await storageClient.storage
      .from("inquiry-files")
      .upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      logServerError("messages.uploadInquiryAttachment.upload", uploadErr);
      return { ok: false, error: "Upload failed." };
    }

    const { data: inserted, error: insertErr } = await r.supabase
      .from("inquiry_attachments")
      .insert({
        tenant_id: r.scope.tenantId,
        inquiry_id: inquiryId,
        uploaded_by: me,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type || null,
        byte_size: file.size,
        description,
        visibility,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      logServerError("messages.uploadInquiryAttachment.insert", insertErr);
      // Best-effort cleanup of orphan blob.
      void storageClient.storage.from("inquiry-files").remove([storagePath]);
      return { ok: false, error: "Could not record attachment." };
    }

    refreshMessages(tenantSlug, inquiryId);
    return { ok: true, data: { id: (inserted as { id: string }).id } };
  } catch (err) {
    logServerError("messages.uploadInquiryAttachment", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Soft-delete an attachment (sets deleted_at, removes blob best-effort). */
export async function deleteInquiryAttachment(
  tenantSlug: string,
  inquiryId: string,
  attachmentId: string,
): Promise<ActionResult<null>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    const { data: row, error: getErr } = await r.supabase
      .from("inquiry_attachments")
      .select("storage_path")
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .eq("id", attachmentId)
      .maybeSingle();

    if (getErr || !row) return { ok: false, error: "Attachment not found." };

    const { error: updateErr } = await r.supabase
      .from("inquiry_attachments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("tenant_id", r.scope.tenantId)
      .eq("id", attachmentId);

    if (updateErr) {
      logServerError("messages.deleteInquiryAttachment", updateErr);
      return { ok: false, error: "Could not delete." };
    }

    // Best-effort blob cleanup.
    const admin = createServiceRoleClient();
    const storageClient = admin ?? r.supabase;
    void storageClient.storage
      .from("inquiry-files")
      .remove([(row as { storage_path: string }).storage_path]);

    refreshMessages(tenantSlug, inquiryId);
    return { ok: true };
  } catch (err) {
    logServerError("messages.deleteInquiryAttachment", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Returns a short-lived signed URL for downloading an attachment. */
export async function getAttachmentSignedUrl(
  tenantSlug: string,
  inquiryId: string,
  attachmentId: string,
): Promise<ActionResult<{ url: string }>> {
  try {
    const r = await gateAndClient(tenantSlug);
    if (!r.ok) return r;

    const { data: row, error } = await r.supabase
      .from("inquiry_attachments")
      .select("storage_path")
      .eq("tenant_id", r.scope.tenantId)
      .eq("inquiry_id", inquiryId)
      .eq("id", attachmentId)
      .maybeSingle();

    if (error || !row) return { ok: false, error: "Attachment not found." };

    const admin = createServiceRoleClient();
    const storageClient = admin ?? r.supabase;
    const { data, error: signErr } = await storageClient.storage
      .from("inquiry-files")
      .createSignedUrl((row as { storage_path: string }).storage_path, 60 * 5);

    if (signErr || !data) {
      logServerError("messages.getAttachmentSignedUrl", signErr);
      return { ok: false, error: "Could not generate link." };
    }

    return { ok: true, data: { url: data.signedUrl } };
  } catch (err) {
    logServerError("messages.getAttachmentSignedUrl", err);
    return { ok: false, error: "Unexpected error." };
  }
}
