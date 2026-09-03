"use server";

/**
 * Public Menu order action — one atomic submit.
 * Re-resolves every offering server-side; never silently drops a line.
 * Email is required (no anonymous menu order).
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { ensureGuestClientByEmail } from "@/lib/inquiry/guest-client";
import {
  createMenuOrder,
  type MenuOrderLineInput,
} from "@/lib/inquiry/menu-order-engine";
import { logServerError } from "@/lib/server/safe-error";

export type SubmitMenuOrderInput = {
  tenantId: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
  lines: MenuOrderLineInput[];
  payInPerson?: boolean;
  sourcePage?: string | null;
};

export type SubmitMenuOrderResult =
  | { ok: true; inquiryId: string; bookingId: string }
  | {
      ok: false;
      error: string;
      reason?: string;
      offeringId?: string;
    };

export async function submitMenuOrder(
  input: SubmitMenuOrderInput,
): Promise<SubmitMenuOrderResult> {
  try {
    const email = input.contactEmail?.trim().toLowerCase() ?? "";
    const name = input.contactName?.trim() ?? "";
    if (!email || !email.includes("@")) {
      return { ok: false, error: "Email is required to place an order." };
    }
    if (!name) {
      return { ok: false, error: "Name is required to place an order." };
    }
    if (!input.tenantId || !Array.isArray(input.lines) || input.lines.length === 0) {
      return { ok: false, error: "Your order is empty." };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

    let clientUserId = user?.id ?? null;
    if (!clientUserId) {
      const guest = await ensureGuestClientByEmail({
        email,
        name,
        company: "",
        phone: input.contactPhone?.trim() ?? "",
      });
      clientUserId = guest.clientUserId;
    }
    if (!clientUserId) {
      return {
        ok: false,
        error: "Could not create your order account. Check the email and try again.",
      };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Database not available." };

    const result = await createMenuOrder(admin, {
      tenantId: input.tenantId,
      clientUserId,
      contactName: name,
      contactEmail: email,
      contactPhone: input.contactPhone ?? null,
      lines: input.lines,
      payInPerson: input.payInPerson === true,
      sourcePage: input.sourcePage ?? null,
    });

    if (!result.ok) {
      if (result.reason === "offering_unresolvable") {
        return {
          ok: false,
          error: result.error ?? "One of the menu items is no longer available.",
          reason: result.reason,
          offeringId: result.offeringId,
        };
      }
      return {
        ok: false,
        error: result.error ?? "Could not place the order.",
        reason: result.reason,
      };
    }

    return {
      ok: true,
      inquiryId: result.inquiryId,
      bookingId: result.bookingId,
    };
  } catch (err) {
    logServerError("submitMenuOrder", err);
    return { ok: false, error: "Unexpected error placing the order." };
  }
}
