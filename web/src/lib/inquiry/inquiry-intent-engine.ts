/**
 * inquiry-intent-engine.ts — orchestration around InquiryIntent.
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §15 + §18
 * Plan: web/docs/client-execution-plan-2026-05-14.md §21.2
 *
 * Three public entry points:
 *   • createInquiryFromIntent — one-shot submit (no draft persistence)
 *   • saveInquiryDraft        — upsert into public.inquiry_drafts
 *   • submitInquiryDraft      — load a draft, validate, submit, mark
 *
 * Every legacy submit path (submitClientInquiry, submitGuestInquiry,
 * createClientWorkspaceInquiryAction, createAgencyInquiry,
 * convertPitchToInquiry, and the deleted createManualInquiry) routes
 * through createInquiryFromIntent. Direct INSERTs into public.inquiries
 * are no longer allowed outside the engine.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { submitInquiry } from "./inquiry-engine-submit";
import type { EngineResult } from "./inquiry-engine.types";
import {
  intentToSubmitInquiryInput,
  validateIntentForSubmit,
  type InquiryIntent,
  type IntentAdapterContext,
  type MissingInfoFlag,
} from "./inquiry-intent";

// ─────────────────────────────────────────────────────────────────────────────
// One-shot path — no draft persistence.
// ─────────────────────────────────────────────────────────────────────────────

export type CreateInquiryFromIntentResult =
  | {
      ok: true;
      inquiryId: string;
      missingInfoFlags: MissingInfoFlag[];
    }
  | {
      ok: false;
      reason:
        | "validation_failed"
        | "rate_limited"
        | "forbidden"
        | "engine_error";
      missingFields?: string[];
      error?: string;
    };

/**
 * Builds an InquiryIntent into a real `public.inquiries` row by funnelling
 * it through the existing `submitInquiry` engine. The caller is responsible
 * for resolving any reference fields BEFORE calling (e.g. shortlist_id →
 * talent_ids) so this function can stay synchronous-ish about validation.
 *
 * Note on draft state: this function does NOT load or write the
 * inquiry_drafts table. For drafts use saveInquiryDraft / submitInquiryDraft.
 */
export async function createInquiryFromIntent(
  supabase: SupabaseClient,
  intent: InquiryIntent,
  ctx: IntentAdapterContext,
): Promise<CreateInquiryFromIntentResult> {
  const validation = validateIntentForSubmit(intent);
  if (!validation.ok) {
    return {
      ok: false,
      reason: "validation_failed",
      missingFields: validation.missingFields,
    };
  }

  const submitInput = intentToSubmitInquiryInput(intent, ctx);
  const result = await submitInquiry(supabase, submitInput);

  if (!result.success) {
    if (result.rateLimited) {
      return { ok: false, reason: "rate_limited" };
    }
    if (result.forbidden) {
      return { ok: false, reason: "forbidden" };
    }
    return { ok: false, reason: "engine_error", error: result.error };
  }

  return {
    ok: true,
    inquiryId: result.data!.inquiryId,
    missingInfoFlags: validation.missingInfoFlags,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Draft CRUD — persisted in public.inquiry_drafts.
// ─────────────────────────────────────────────────────────────────────────────

export type DraftMetadata = {
  id: string;
  tenant_id: string;
  requester_user_id: string | null;
  requester_email: string | null;
  source: string;
  submitted_inquiry_id: string | null;
  abandoned_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveDraftContext = {
  tenant_id: string;
  /** Auth user composing the draft. NULL for guest drafts. */
  requester_user_id: string | null;
  /** Email to pre-bind a guest draft to (used for resume-via-magic-link). */
  requester_email?: string | null;
};

/**
 * Upsert a draft. Pass `draftId=null` to create a new one; pass an
 * existing id to update.
 *
 * Returns the draft id so the caller can keep autosaving to the same row.
 */
export async function saveInquiryDraft(
  supabase: SupabaseClient,
  draftId: string | null,
  intent: InquiryIntent,
  ctx: SaveDraftContext,
): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  if (draftId) {
    // Update existing draft.
    const { error } = await supabase
      .from("inquiry_drafts")
      .update({
        intent,
        source: intent.source,
        source_context: intent.source_context ?? {},
        requester_email: ctx.requester_email ?? null,
      })
      .eq("id", draftId)
      .eq("tenant_id", ctx.tenant_id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, draftId };
  }

  // Create new draft.
  const { data, error } = await supabase
    .from("inquiry_drafts")
    .insert({
      tenant_id: ctx.tenant_id,
      requester_user_id: ctx.requester_user_id,
      requester_email: ctx.requester_email ?? null,
      intent,
      source: intent.source,
      source_context: intent.source_context ?? {},
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, draftId: data.id as string };
}

/** Loads a draft if the actor has access. RLS handles authorization. */
export async function loadInquiryDraft(
  supabase: SupabaseClient,
  draftId: string,
): Promise<
  | { ok: true; draft: DraftMetadata & { intent: InquiryIntent } }
  | { ok: false; reason: "not_found" | "forbidden" }
> {
  const { data, error } = await supabase
    .from("inquiry_drafts")
    .select(
      "id, tenant_id, requester_user_id, requester_email, source, intent, submitted_inquiry_id, abandoned_at, created_at, updated_at",
    )
    .eq("id", draftId)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "not_found" };
  return {
    ok: true,
    draft: {
      id: data.id as string,
      tenant_id: data.tenant_id as string,
      requester_user_id: data.requester_user_id as string | null,
      requester_email: data.requester_email as string | null,
      source: data.source as string,
      submitted_inquiry_id: data.submitted_inquiry_id as string | null,
      abandoned_at: data.abandoned_at as string | null,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
      intent: data.intent as unknown as InquiryIntent,
    },
  };
}

/** Lists open drafts for the current actor (RLS-scoped). */
export async function listOpenDraftsForUser(
  supabase: SupabaseClient,
  ctx: { tenant_id: string; requester_user_id: string },
): Promise<DraftMetadata[]> {
  const { data, error } = await supabase
    .from("inquiry_drafts")
    .select(
      "id, tenant_id, requester_user_id, requester_email, source, submitted_inquiry_id, abandoned_at, created_at, updated_at",
    )
    .eq("tenant_id", ctx.tenant_id)
    .eq("requester_user_id", ctx.requester_user_id)
    .is("submitted_inquiry_id", null)
    .is("abandoned_at", null)
    .order("updated_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as DraftMetadata[];
}

/**
 * Submit a draft. Loads it, validates, calls the engine, and marks the
 * draft submitted by stamping `submitted_inquiry_id`.
 */
export async function submitInquiryDraft(
  supabase: SupabaseClient,
  draftId: string,
  ctx: Omit<IntentAdapterContext, "tenant_id">,
): Promise<CreateInquiryFromIntentResult> {
  const loaded = await loadInquiryDraft(supabase, draftId);
  if (!loaded.ok) return { ok: false, reason: "forbidden" };

  if (loaded.draft.submitted_inquiry_id) {
    // Idempotent return — already submitted.
    return {
      ok: true,
      inquiryId: loaded.draft.submitted_inquiry_id,
      missingInfoFlags: [],
    };
  }

  const submitResult = await createInquiryFromIntent(
    supabase,
    loaded.draft.intent,
    {
      ...ctx,
      tenant_id: loaded.draft.tenant_id,
    },
  );

  if (!submitResult.ok) return submitResult;

  // Mark the draft as submitted (audit trail; RLS-scoped to the owner).
  // Service-role escalation isn't needed here because the actor is the
  // draft owner.
  await supabase
    .from("inquiry_drafts")
    .update({ submitted_inquiry_id: submitResult.inquiryId })
    .eq("id", draftId);

  return submitResult;
}

/**
 * Mark a draft as abandoned (cron-prune candidate). Reversible — owner
 * can edit and the abandoned_at stamp clears on the next save.
 */
export async function abandonInquiryDraft(
  supabase: SupabaseClient,
  draftId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("inquiry_drafts")
    .update({ abandoned_at: new Date().toISOString() })
    .eq("id", draftId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Re-export the EngineResult type for callers that want it.
export type { EngineResult };
