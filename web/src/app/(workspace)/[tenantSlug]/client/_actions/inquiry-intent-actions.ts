"use server";

/**
 * inquiry-intent-actions.ts — server actions for the InquiryDrawer.
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §15 + §18
 * Plan: web/docs/client-execution-plan-2026-05-14.md §21.2
 *
 * Three entry points the UI calls:
 *   • saveDraftAction          — autosave a draft (10s + blur + visibility)
 *   • submitDraftAction        — submit a previously saved draft
 *   • submitInquiryNowAction   — one-shot submit without a draft (fast path)
 *
 * All three funnel into the canonical engine
 * (createInquiryFromIntent / saveInquiryDraft / submitInquiryDraft) so the
 * UI never assembles SubmitInquiryInput by hand.
 *
 * Returns flat ActionState objects compatible with React's useActionState.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import {
  type InquiryIntent,
} from "@/lib/inquiry/inquiry-intent";
import {
  createInquiryFromIntent,
  saveInquiryDraft,
  submitInquiryDraft,
  type CreateInquiryFromIntentResult,
} from "@/lib/inquiry/inquiry-intent-engine";
import { logServerError } from "@/lib/server/safe-error";

// ─────────────────────────────────────────────────────────────────────────────
// Action result shape — flat object compatible with useActionState.
// ─────────────────────────────────────────────────────────────────────────────

export type InquiryIntentActionState =
  | { kind: "idle" }
  | { kind: "saved"; draftId: string; savedAt: string }
  | { kind: "submitted"; inquiryId: string; tenantSlug: string }
  | { kind: "error"; message: string; missingFields?: string[] };

// ─────────────────────────────────────────────────────────────────────────────
// Shared resolver: pull tenant + actor session + supabase client.
// ─────────────────────────────────────────────────────────────────────────────

async function resolveSubmitContext(tenantSlug: string) {
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return { ok: false as const, error: "tenant_not_found" };

  const session = await getCachedActorSession();
  // Note: session.user is NULL on guest path. That's OK — submitInquiry +
  // createInquiryFromIntent both handle the guest case.
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false as const, error: "db_unavailable" };
  const admin = createServiceRoleClient();
  // Service-role client is used for writes after the permission gate inside
  // submitInquiry. We pass it to the engine so RLS doesn't block the
  // inquiry-row INSERT for fresh client accounts.
  const writeClient = admin ?? supabase;

  return {
    ok: true as const,
    tenantSlug,
    tenantId: scope.tenantId,
    supabase,
    writeClient,
    actorUserId: session.user?.id ?? null,
    actorEmail: session.user?.email ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Save (autosave) a draft.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upserts an inquiry_drafts row. Called from the drawer autosave hook on a
 * 10-second cadence (configurable) + on blur + on visibility change.
 *
 * Does NOT submit. Does NOT redirect. Returns the draft id so the client
 * can keep autosaving to the same row.
 */
export async function saveDraftAction(
  prevState: InquiryIntentActionState,
  formData: FormData,
): Promise<InquiryIntentActionState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  if (!tenantSlug) return { kind: "error", message: "Missing tenant slug." };

  const intentJson = String(formData.get("intent") ?? "");
  const draftId = String(formData.get("draftId") ?? "") || null;
  let intent: InquiryIntent;
  try {
    intent = JSON.parse(intentJson);
  } catch {
    return { kind: "error", message: "Malformed intent payload." };
  }

  const ctx = await resolveSubmitContext(tenantSlug);
  if (!ctx.ok) return { kind: "error", message: ctx.error };

  // Drafts can only be saved by authenticated users for now. Guest drafts
  // (anonymous on /t/[profileCode]) submit immediately without a draft row —
  // the guest path skips autosave. The drawer surfaces this difference by
  // not mounting the autosave hook when actorUserId is null.
  if (!ctx.actorUserId) {
    return { kind: "error", message: "Sign in to save a draft." };
  }

  const result = await saveInquiryDraft(ctx.supabase, draftId, intent, {
    tenant_id: ctx.tenantId,
    requester_user_id: ctx.actorUserId,
    requester_email: ctx.actorEmail,
  });
  if (!result.ok) {
    logServerError("inquiry-intent-actions.saveDraft", new Error(result.error));
    return { kind: "error", message: "Could not save draft." };
  }

  // Touch the savedAt timestamp so the UI can show "Saved 12s ago".
  void prevState;
  return { kind: "saved", draftId: result.draftId, savedAt: new Date().toISOString() };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Submit a draft (load → validate → submit → redirect).
// ─────────────────────────────────────────────────────────────────────────────

export async function submitDraftAction(
  _prev: InquiryIntentActionState,
  formData: FormData,
): Promise<InquiryIntentActionState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const draftId = String(formData.get("draftId") ?? "").trim();
  if (!tenantSlug) return { kind: "error", message: "Missing tenant slug." };
  if (!draftId) return { kind: "error", message: "Missing draft id." };

  const ctx = await resolveSubmitContext(tenantSlug);
  if (!ctx.ok) return { kind: "error", message: ctx.error };

  const result = await submitInquiryDraft(ctx.writeClient, draftId, {
    actor_user_id: ctx.actorUserId,
    client_user_id: ctx.actorUserId,
  });
  return finalizeSubmit(result, tenantSlug);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. One-shot submit — no draft persisted (fast path used by guests + the
//    review step when the user hits "Send" without ever saving a draft).
// ─────────────────────────────────────────────────────────────────────────────

export async function submitInquiryNowAction(
  _prev: InquiryIntentActionState,
  formData: FormData,
): Promise<InquiryIntentActionState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  if (!tenantSlug) return { kind: "error", message: "Missing tenant slug." };

  const intentJson = String(formData.get("intent") ?? "");
  let intent: InquiryIntent;
  try {
    intent = JSON.parse(intentJson);
  } catch {
    return { kind: "error", message: "Malformed intent payload." };
  }

  const ctx = await resolveSubmitContext(tenantSlug);
  if (!ctx.ok) return { kind: "error", message: ctx.error };

  // For logged-in clients the intent.requester.user_id should be the
  // actor's user_id. For guests (no actor) the requester carries
  // name/email/phone but no user_id; the engine creates a guest_sessions
  // row internally.
  if (ctx.actorUserId && !intent.requester.user_id) {
    intent.requester.user_id = ctx.actorUserId;
  }

  const result = await createInquiryFromIntent(ctx.writeClient, intent, {
    tenant_id: ctx.tenantId,
    actor_user_id: ctx.actorUserId,
    client_user_id: ctx.actorUserId,
  });
  return finalizeSubmit(result, tenantSlug);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function finalizeSubmit(
  result: CreateInquiryFromIntentResult,
  tenantSlug: string,
): InquiryIntentActionState {
  if (!result.ok) {
    if (result.reason === "validation_failed") {
      return {
        kind: "error",
        message: validationMessage(result.missingFields ?? []),
        missingFields: result.missingFields,
      };
    }
    if (result.reason === "rate_limited") {
      return { kind: "error", message: "Too many inquiries — slow down a bit." };
    }
    if (result.reason === "forbidden") {
      return { kind: "error", message: "You don't have permission to do that." };
    }
    return { kind: "error", message: result.error ?? "Could not send inquiry." };
  }

  // Revalidate the surfaces that show inquiries.
  revalidatePath(`/${tenantSlug}/client/messages`);
  revalidatePath(`/${tenantSlug}/client/today`);
  revalidatePath(`/${tenantSlug}/client/inquiries`);

  // Per spec §15 — redirect to the Messages shell pinned on this inquiry.
  redirect(
    `/${tenantSlug}/client/messages?inquiry=${encodeURIComponent(result.inquiryId)}&just_submitted=1`,
  );
}

function validationMessage(missing: string[]): string {
  if (missing.length === 0) return "Add the missing details and try again.";
  const friendly = missing
    .map((f) => {
      switch (f) {
        case "requester.name":
          return "your name";
        case "requester.email_or_phone":
          return "an email or phone";
        case "brief.summary_or_talent":
          return "a brief or a selected talent";
        case "location.city_or_status":
          return "a city or location status";
        case "date.event_date_or_status":
          return "a date or a date flexibility";
        default:
          return f;
      }
    })
    .join(", ");
  return `Add ${friendly} to continue.`;
}
