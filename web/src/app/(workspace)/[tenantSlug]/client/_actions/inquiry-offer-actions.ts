"use server";

/**
 * inquiry-offer-actions.ts — client-side offer decision actions.
 *
 * Spec: web/docs/inquiry-engine-spec-2026-05-14.md §6.3 + §19
 * Plan: web/docs/client-execution-plan-2026-05-14.md §23 Phase E
 *
 * Three actions exposed to the OfferTab approve/decline drawers:
 *   • approveOfferAction — calls clientAcceptOffer (engine) — version-
 *     locked optimistic update, fires APPROVAL_SUBMITTED event.
 *   • rejectOfferAction  — calls clientRejectOffer (engine) — accepts
 *     a structured rejection reason + free-text note.
 *   • undoRecentDecisionAction — best-effort undo within a 4s window
 *     (Phase E enhancement; the engine doesn't support undo natively
 *     yet so this just refreshes details; real undo lands in B-4.1).
 *
 * All actions return InquiryOfferActionState compatible with
 * React useActionState. Redirect happens server-side via redirect()
 * after a successful action.
 */

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import {
  clientAcceptOffer,
  clientRejectOffer,
} from "@/lib/inquiry/inquiry-engine";
import { sendClientInquiryMessage } from "../inquiries/[id]/actions";
import { logServerError } from "@/lib/server/safe-error";

export type InquiryOfferActionState =
  | { kind: "idle" }
  | { kind: "approved"; inquiryId: string; offerId: string }
  | { kind: "rejected"; inquiryId: string; offerId: string }
  | { kind: "countered"; inquiryId: string }
  | { kind: "error"; message: string };

/** Allowed rejection-reason values (mirrors the DB CHECK constraint). */
const REJECTION_REASONS = new Set([
  "too_expensive",
  "wrong_talent",
  "timing",
  "changed_plans",
  "other",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Approve offer.
// ─────────────────────────────────────────────────────────────────────────────

export async function approveOfferAction(
  _prev: InquiryOfferActionState,
  formData: FormData,
): Promise<InquiryOfferActionState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  const offerId = String(formData.get("offerId") ?? "").trim();
  const expectedVersion = Number(formData.get("expectedVersion") ?? "0");

  if (!tenantSlug || !inquiryId || !offerId || !Number.isFinite(expectedVersion)) {
    return { kind: "error", message: "Missing approval payload." };
  }

  const session = await getCachedActorSession();
  if (!session.user) return { kind: "error", message: "Sign in to approve offers." };

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return { kind: "error", message: "Workspace not found." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { kind: "error", message: "Database unavailable." };
  const admin = createServiceRoleClient();
  const writeClient = admin ?? supabase;

  const result = await clientAcceptOffer(writeClient, {
    inquiryId,
    tenantId: scope.tenantId,
    offerId,
    actorUserId: session.user.id,
    expectedVersion,
  });

  if (!result.success) {
    if (result.rateLimited) {
      const secs = Math.max(1, Math.ceil((result.retryAfterMs ?? 1000) / 1000));
      return { kind: "error", message: `Too many attempts — try again in ${secs}s.` };
    }
    if (result.conflict) {
      return {
        kind: "error",
        message: "The offer changed while you were reviewing. Refresh to see the latest.",
      };
    }
    if (result.forbidden) {
      return { kind: "error", message: "You don't have permission to approve this offer." };
    }
    logServerError("client.approveOffer", new Error(JSON.stringify(result)));
    return { kind: "error", message: result.error ?? "Could not approve. Try again." };
  }

  revalidatePath(`/${tenantSlug}/client/messages`);
  revalidatePath(`/${tenantSlug}/client/inquiries/${inquiryId}`);
  return { kind: "approved", inquiryId, offerId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reject offer.
// ─────────────────────────────────────────────────────────────────────────────

export async function rejectOfferAction(
  _prev: InquiryOfferActionState,
  formData: FormData,
): Promise<InquiryOfferActionState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  const offerId = String(formData.get("offerId") ?? "").trim();
  const expectedVersion = Number(formData.get("expectedVersion") ?? "0");
  const rawReason = String(formData.get("reason") ?? "").trim() || "other";
  const reason = REJECTION_REASONS.has(rawReason) ? rawReason : "other";
  const reasonText = String(formData.get("reasonText") ?? "").trim() || null;

  if (!tenantSlug || !inquiryId || !offerId || !Number.isFinite(expectedVersion)) {
    return { kind: "error", message: "Missing rejection payload." };
  }

  const session = await getCachedActorSession();
  if (!session.user) return { kind: "error", message: "Sign in to decline offers." };

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return { kind: "error", message: "Workspace not found." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { kind: "error", message: "Database unavailable." };
  const admin = createServiceRoleClient();
  const writeClient = admin ?? supabase;

  const result = await clientRejectOffer(writeClient, {
    inquiryId,
    tenantId: scope.tenantId,
    offerId,
    actorUserId: session.user.id,
    expectedVersion,
    rejectionReason: reason,
    rejectionReasonText: reasonText,
  });

  if (!result.success) {
    if (result.rateLimited) {
      const secs = Math.max(1, Math.ceil((result.retryAfterMs ?? 1000) / 1000));
      return { kind: "error", message: `Too many attempts — try again in ${secs}s.` };
    }
    if (result.conflict) {
      return {
        kind: "error",
        message: "The offer changed while you were reviewing. Refresh to see the latest.",
      };
    }
    if (result.forbidden) {
      return { kind: "error", message: "You don't have permission to decline this offer." };
    }
    logServerError("client.rejectOffer", new Error(JSON.stringify(result)));
    return { kind: "error", message: result.error ?? "Could not decline. Try again." };
  }

  revalidatePath(`/${tenantSlug}/client/messages`);
  revalidatePath(`/${tenantSlug}/client/inquiries/${inquiryId}`);
  return { kind: "rejected", inquiryId, offerId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Counter offer — propose a change without declining.
// ─────────────────────────────────────────────────────────────────────────────
// A client counter is a tagged "[Counter request]" message to the coordinator;
// it does NOT change the offer state (the coordinator re-drafts the offer). This
// mirrors the legacy thread Counter affordance + the talent counter, so the
// keeper OfferTab reaches Approve / Counter / Decline parity (audit #13, part 4).

export async function counterOfferAction(
  _prev: InquiryOfferActionState,
  formData: FormData,
): Promise<InquiryOfferActionState> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "").trim();
  const inquiryId = String(formData.get("inquiryId") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!tenantSlug || !inquiryId) return { kind: "error", message: "Missing counter payload." };
  if (!note) return { kind: "error", message: "Add a note describing what you'd like to change." };
  if (note.length > 4000) return { kind: "error", message: "Note is too long." };

  const session = await getCachedActorSession();
  if (!session.user) return { kind: "error", message: "Sign in to send a counter." };

  const result = await sendClientInquiryMessage(tenantSlug, inquiryId, `[Counter request] ${note}`);
  if (!result.ok) {
    logServerError("client.counterOffer", new Error(result.error ?? "counter failed"));
    return { kind: "error", message: result.error ?? "Could not send your counter. Try again." };
  }

  revalidatePath(`/${tenantSlug}/client/messages`);
  revalidatePath(`/${tenantSlug}/client/inquiries/${inquiryId}`);
  return { kind: "countered", inquiryId };
}
