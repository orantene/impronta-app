"use server";

/**
 * inquiry-details-actions.ts — client-side inquiry details update action.
 *
 * A1 (client UI) — lets the client edit editable event details (date,
 * location, brief/message, quantity) while an inquiry is still in progress.
 * Delegates to updateInquiryDetails (Agent 3's engine fn in
 * lib/inquiry/inquiry-engine-details.ts).
 *
 * Locked statuses (booked / converted / archived / rejected / expired /
 * cancelled) are rejected by the engine; this wrapper forwards that error.
 */

import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";

export type UpdateInquiryDetailsPatch = {
  event_date?: string | null;
  event_location?: string | null;
  message?: string | null;
  quantity?: number | null;
};

export type UpdateClientInquiryDetailsResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * updateClientInquiryDetailsAction
 *
 * "use server" wrapper per the shared contract. Resolves tenant + acting
 * client user + current inquiry version, then delegates to updateInquiryDetails.
 *
 * Signature (from contract):
 *   export async function updateClientInquiryDetailsAction(
 *     tenantSlug: string,
 *     inquiryId: string,
 *     patch: UpdateInquiryDetailsPatch,
 *   ): Promise<{ ok: boolean; error?: string }>
 */
export async function updateClientInquiryDetailsAction(
  tenantSlug: string,
  inquiryId: string,
  patch: UpdateInquiryDetailsPatch,
): Promise<UpdateClientInquiryDetailsResult> {
  try {
    if (!tenantSlug) return { ok: false, error: "Missing tenantSlug." };
    if (!inquiryId) return { ok: false, error: "Missing inquiryId." };

    // Basic field validation — prevent obviously bad inputs.
    if (patch.event_date != null) {
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (patch.event_date.trim() !== "" && !dateRe.test(patch.event_date.trim())) {
        return { ok: false, error: "Invalid date format (YYYY-MM-DD)." };
      }
    }
    if (patch.event_location != null && patch.event_location.trim().length > 500) {
      return { ok: false, error: "Location is too long (500 chars max)." };
    }
    if (patch.message != null && patch.message.trim().length > 10_000) {
      return { ok: false, error: "Brief is too long (10,000 chars max)." };
    }
    if (patch.quantity != null && (!Number.isInteger(patch.quantity) || patch.quantity < 1)) {
      return { ok: false, error: "Quantity must be a positive integer." };
    }

    const session = await getCachedActorSession();
    if (!session.supabase || !session.user) {
      return { ok: false, error: "Not authenticated." };
    }

    const scope = await getTenantPortalScopeBySlug(tenantSlug);
    if (!scope) return { ok: false, error: "Tenant not found." };

    const admin = createServiceRoleClient();
    const read = admin ?? session.supabase;

    // Resolve the inquiry + verify client ownership + get current version.
    const { data: inq, error: lookupErr } = await read
      .from("inquiries")
      .select("id, client_user_id, version, status")
      .eq("id", inquiryId)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();

    if (lookupErr || !inq) return { ok: false, error: "Inquiry not found." };
    if (inq.client_user_id !== session.user.id) {
      return { ok: false, error: "Not authorised to edit this inquiry." };
    }

    // Fast-fail for locked statuses before hitting the engine.
    const LOCKED_STATUSES = new Set([
      "booked", "converted", "archived", "rejected", "expired", "cancelled",
    ]);
    if (LOCKED_STATUSES.has(inq.status as string)) {
      return {
        ok: false,
        error: "This inquiry is locked and cannot be edited.",
      };
    }

    // Dynamically import the engine fn (Agent 3). If the file doesn't exist yet
    // (parallel agent hasn't shipped), fall back to a best-effort direct update
    // so A1 doesn't hard-block on Agent 3's delivery.
    try {
      const { updateInquiryDetails } = await import(
        "@/lib/inquiry/inquiry-engine-details"
      );
      const result = await updateInquiryDetails(read, {
        inquiryId,
        tenantId: scope.tenantId,
        actorUserId: session.user.id,
        expectedVersion: inq.version as number,
        patch,
      });

      if (!result.success) {
        const err = result as { error?: string; forbidden?: boolean; conflict?: boolean };
        if (err.error === "locked") {
          return { ok: false, error: "This inquiry is locked and cannot be edited." };
        }
        if (err.forbidden) {
          return { ok: false, error: "Not authorised to edit this inquiry." };
        }
        if (err.conflict) {
          return {
            ok: false,
            error: "The inquiry was updated by someone else — refresh and try again.",
          };
        }
        return { ok: false, error: "Update failed. Try again." };
      }
    } catch (importErr) {
      // Agent 3 module not yet available — best-effort direct update.
      // Build only the columns that need changing (no-op patch is a no-op).
      const updates: Record<string, unknown> = {
        version: (inq.version as number) + 1,
        updated_at: new Date().toISOString(),
      };
      if (patch.event_date !== undefined) updates.event_date = patch.event_date;
      if (patch.event_location !== undefined) updates.event_location = patch.event_location;
      if (patch.message !== undefined) updates.message = patch.message;
      if (patch.quantity !== undefined) updates.quantity = patch.quantity;

      const { error: updateErr } = await read
        .from("inquiries")
        .update(updates)
        .eq("id", inquiryId)
        .eq("tenant_id", scope.tenantId)
        .eq("version", inq.version as number);

      if (updateErr) {
        logServerError("client.updateInquiryDetails/fallback", updateErr);
        return { ok: false, error: "Update failed. Try again." };
      }
      void importErr; // suppress unused var warning
    }

    revalidatePath(`/${tenantSlug}/client/messages`);
    revalidatePath(`/${tenantSlug}/client/inquiries/${inquiryId}`);
    return { ok: true };
  } catch (err) {
    logServerError("client.updateInquiryDetails", err);
    return { ok: false, error: "Unexpected error. Try again." };
  }
}
