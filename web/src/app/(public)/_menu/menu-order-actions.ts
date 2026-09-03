"use server";

/**
 * Public Menu order action — one atomic submit.
 * Re-resolves every offering server-side; never silently drops a line.
 * Email is required (no anonymous menu order).
 */

import { createPurchase } from "@/lib/orders/purchase";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
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

    // NO GUEST PROVISIONING. `ensureGuestClientByEmail` minted a real
    // `auth.users` row on every submit — seven of production's thirty-one auth
    // identities are `menu-qa-<timestamp>@example.com` from QA runs. A customer
    // is an email; an account is something they GAIN if they sign up.
    // Retiring the provisioner everywhere is 0.4b; this call site stops using
    // it today.
    const actorUserId = user?.id ?? null;

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Database not available." };

    const result = await createPurchase(admin, {
      tenantId: input.tenantId,
      // Per CART. The board's session key is stable across re-renders and a
      // reload, so a double-tapped Send cannot mint two orders.
      clientOrderKey: `menu:${input.tenantId}:${email}:${input.sourcePage ?? ""}`,
      actorUserId,
      contact: { email, phone: input.contactPhone ?? null, displayName: name },
      lines: input.lines.map((l) => ({ offeringId: l.offeringId, units: l.quantity })),
      // INTENT, never policy. The pipeline re-derives what this offering allows
      // from its own row and refuses if they disagree — which is the whole
      // indictment of the engine this replaces: it rendered offerings whose
      // reserve_mode, deposit_pct and allow_pay_in_person it never read.
      paymentChoice: input.payInPerson === true ? "in_person" : "full",
      sourceChannel: "menu",
      sourcePage: input.sourcePage ?? null,
      // Staff work menu orders in Messages today. The order is the record; the
      // thread is where the conversation about it lives.
      openThread: true,
    });

    if (!result.ok) {
      // The pipeline's refusal reasons are stable strings and are NOT the old
      // engine's. `offering_not_priceable` / `unknown_offering` /
      // `offering_not_published` all mean "this item cannot be ordered", which
      // is what the board needs to know to point at a row.
      if (
        result.reason === "offering_not_priceable"
        || result.reason === "unknown_offering"
        || result.reason === "offering_not_published"
      ) {
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
      orderId: result.orderId,
      inquiryId: result.inquiryId,
      bookingId: result.bookingId,
    };
  } catch (err) {
    logServerError("submitMenuOrder", err);
    return { ok: false, error: "Unexpected error placing the order." };
  }
}
