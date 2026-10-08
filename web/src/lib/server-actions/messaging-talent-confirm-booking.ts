"use server";

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { loadOwnedTalentInquiry, loadTalentActor } from "@/lib/messaging/talent-actor";
import {
  confirmAcceptedOffer,
  loadConfirmState,
  talentMaySell,
  type ConfirmBookingResult,
  type ConfirmStateView,
} from "@/lib/messaging/talent-confirm-booking";
import { productionConfirmStore } from "@/lib/messaging/talent-confirm-booking-store";

/**
 * A solo talent confirms the booking and requests payment on an ACCEPTED offer,
 * from her own inbox thread. The writer is `ensureAcceptedOfferPayment` (the one
 * the client's own accept runs); see `lib/messaging/talent-confirm-booking.ts`.
 *
 * Authority, all server-side: the signed-in user's talent profile, a seat on
 * THIS inquiry that is not invited/declined, and the inquiry's tenant being the
 * platform hub (her own sale; an agency sale is the agency's to confirm). The
 * tenant comes from the inquiry row (`loadOwnedTalentInquiry`), never from the
 * client. No agency role is needed or granted: the existing staff/coordinator
 * guard is untouched.
 */

const uuid = z.string().uuid();

async function requestOrigin(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host")?.trim() || "";
    if (!host) return "";
    const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  } catch {
    return "";
  }
}

type Resolved =
  | { ok: false }
  | { ok: true; mayAct: false }
  | { ok: true; mayAct: true; talentProfileId: string; tenantId: string; admin: SupabaseClient };

/** Resolve who is asking. A stranger resolves to `mayAct: false` (not_owner), never to an error that leaks the thread. */
async function resolveSeller(inquiryId: string): Promise<Resolved> {
  const actor = await loadTalentActor();
  if (!actor.ok) return actor.reason === "unavailable" ? { ok: false } : { ok: true, mayAct: false };
  const owned = await loadOwnedTalentInquiry(actor.admin, actor.talentProfileId, inquiryId);
  if (!owned.ok) return owned.reason === "unavailable" ? { ok: false } : { ok: true, mayAct: false };
  if (!talentMaySell({ isSeller: owned.isSeller, participantStatus: owned.participantStatus })) return { ok: true, mayAct: false };
  return { ok: true, mayAct: true, talentProfileId: actor.talentProfileId, tenantId: owned.tenantId, admin: actor.admin };
}

const HIDDEN: ConfirmStateView = { state: "hidden", bookingId: null, amountLabel: null, collect: null };

/** What the control shows on this thread. Reads only; hidden for a stranger or while impersonating. */
export async function messagingTalentConfirmBookingState(input: {
  inquiryId: string;
}): Promise<{ ok: true; view: ConfirmStateView } | { ok: false; error: "unavailable" }> {
  if (!(await assertNotImpersonating()).ok) return { ok: true, view: HIDDEN };
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: true, view: HIDDEN };
  const who = await resolveSeller(parsed.data.inquiryId);
  if (!who.ok) return { ok: false, error: "unavailable" };
  if (!who.mayAct) return { ok: true, view: HIDDEN };
  const loaded = await loadConfirmState(
    productionConfirmStore({ admin: who.admin, tenantId: who.tenantId, inquiryId: parsed.data.inquiryId, publicOrigin: "" }),
    { mayAct: true, talentProfileId: who.talentProfileId },
  );
  return loaded.ok ? loaded : { ok: false, error: "unavailable" };
}

/** Confirm the booking and request payment (or retry just the payment request). Idempotent. */
export async function messagingTalentConfirmBooking(input: {
  inquiryId: string;
}): Promise<ConfirmBookingResult> {
  if (!(await assertNotImpersonating()).ok) return { ok: false, error: "impersonating" };
  const parsed = z.object({ inquiryId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "not_owner" };
  const who = await resolveSeller(parsed.data.inquiryId);
  if (!who.ok) return { ok: false, error: "unavailable" };
  if (!who.mayAct) return { ok: false, error: "not_owner" };
  return confirmAcceptedOffer(
    productionConfirmStore({ admin: who.admin, tenantId: who.tenantId, inquiryId: parsed.data.inquiryId, publicOrigin: await requestOrigin() }),
    { mayAct: true, talentProfileId: who.talentProfileId },
  );
}
