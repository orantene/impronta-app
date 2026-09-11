"use server";

/**
 * The numbers Settings › Booking policies (W24) draws in its Holds card and
 * its policy table, read from the modules that ENFORCE them rather than
 * restated: a policy screen that quotes a hold of 15 minutes while the till
 * holds for 10 would be the kind of screen this program exists to end.
 *
 *   POS hold        `RESERVATION_TTL_SECONDS` — how long a card collection
 *                   claims an order's balance at the counter.
 *   Checkout hold   `CARD_RESERVATION_TTL_SECONDS` — the same claim across a
 *                   hosted checkout, which Stripe will not let expire sooner.
 *   Waitlist offer  `DEFAULT_WAITLIST_OFFER_MINUTES` — how long a freed place
 *                   is held for the next person in line.
 *   Notice          `agencies.settings.appointments.defaults.minNoticeMin` —
 *                   the workspace's own booking notice, the closest thing the
 *                   engine has to a reschedule cutoff, and it is drawn as that
 *                   ("same as the booking notice"), never as a cutoff of its own.
 */

import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { CARD_RESERVATION_TTL_SECONDS, RESERVATION_TTL_SECONDS } from "@/lib/pos/collection-reservations";
import { DEFAULT_WAITLIST_OFFER_MINUTES } from "@/lib/scheduling/session-waitlist";
import { normalizeTenantAppointmentsSettings } from "@/lib/scheduling/appointments-settings-types";

export type BookingPolicyFacts = {
  posHoldSeconds: number;
  checkoutHoldSeconds: number;
  waitlistOfferMinutes: number;
  appointmentsEnabled: boolean;
  minNoticeMin: number;
};

export type BookingPolicyFactsResult = { ok: true; facts: BookingPolicyFacts } | { ok: false; reason: "not_allowed" | "unreadable" };

export async function getBookingPolicyFacts(): Promise<BookingPolicyFactsResult> {
  const auth = await requireWorkspaceStaffAction();
  if (!auth.ok) {
    logServerError("booking-policy-facts.denied", auth.error);
    return { ok: false, reason: "not_allowed" };
  }
  const { supabase, tenantId } = auth;
  // eslint-disable-next-line ratchet/no-untenanted-from -- agencies is the tenant table; looked up by its primary key, the session's own tenantId
  const { data, error } = await supabase.from("agencies").select("settings").eq("id", tenantId).maybeSingle();
  if (error) {
    logServerError("booking-policy-facts.agency", error);
    return { ok: false, reason: "unreadable" };
  }
  const settings = (data as { settings?: Record<string, unknown> | null } | null)?.settings ?? {};
  const appointments = normalizeTenantAppointmentsSettings(settings.appointments);
  return {
    ok: true,
    facts: {
      posHoldSeconds: RESERVATION_TTL_SECONDS,
      checkoutHoldSeconds: CARD_RESERVATION_TTL_SECONDS,
      waitlistOfferMinutes: DEFAULT_WAITLIST_OFFER_MINUTES,
      appointmentsEnabled: appointments.enabled,
      minNoticeMin: appointments.defaults.minNoticeMin,
    },
  };
}
