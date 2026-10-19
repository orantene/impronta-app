import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { localizedServiceTitle } from "@/lib/client-account/localized-service-title";
import { bookingOfferingId } from "@/lib/scheduling/booking-cancel-policy";
import { normalizeBookingLocale } from "@/lib/scheduling/booking-locale";
import { logServerError } from "@/lib/server/safe-error";

/**
 * G2: a review is about a SERVICE. Every statement here is best-effort and
 * separate from the review write, so a deployment that has not applied the
 * `offering_id` columns yet only logs; it never fails a page or a submit.
 * The offering id is always derived on the server (the request, else the
 * booking's order line), never taken from the browser.
 */

/** The service a review request is about: its own link first, else the booking's sold offering. */
export async function resolveRequestOfferingId(
  svc: SupabaseClient,
  input: { requestId?: string | null; bookingId: string | null },
): Promise<string | null> {
  try {
    if (input.requestId) {
      const { data, error } = await svc
        .from("review_requests")
        .select("offering_id")
        .eq("id", input.requestId)
        .maybeSingle<{ offering_id: string | null }>();
      // A missing column (migration not applied) is an error here: fall through.
      if (!error && data?.offering_id) return data.offering_id;
    }
    return await offeringIdForBooking(svc, input.bookingId);
  } catch (err) {
    logServerError("reviews/offering/resolve", err);
    return null;
  }
}

/** The offering a booking was sold as (its order's first line); null when none. */
export async function offeringIdForBooking(svc: SupabaseClient, bookingId: string | null): Promise<string | null> {
  if (!bookingId) return null;
  const { data, error } = await svc
    .from("agency_bookings")
    .select("order_id")
    .eq("id", bookingId)
    .maybeSingle<{ order_id: string | null }>();
  if (error || !data?.order_id) return null;
  return bookingOfferingId(svc as unknown as Parameters<typeof bookingOfferingId>[0], data.order_id);
}

/** Link the just-written review to its service. Only fills an empty link; never overwrites. */
export async function stampReviewOffering(
  svc: SupabaseClient,
  input: { bookingId: string; talentProfileId: string; clientUserId: string; offeringId: string | null },
): Promise<void> {
  if (!input.offeringId) return;
  const { error } = await svc
    .from("talent_reviews")
    .update({ offering_id: input.offeringId })
    .eq("booking_id", input.bookingId)
    .eq("talent_profile_id", input.talentProfileId)
    .eq("client_user_id", input.clientUserId)
    .is("offering_id", null);
  if (error) logServerError("reviews/offering/stamp", error);
}

/** The service name on screen, in the page language (its own translation, else the stored title). */
export async function loadOfferingDisplayTitle(
  svc: SupabaseClient,
  offeringId: string | null,
  locale: string,
): Promise<string | null> {
  if (!offeringId) return null;
  try {
    const { data, error } = await svc
      .from("talent_offerings")
      .select("title, title_i18n")
      .eq("id", offeringId)
      .maybeSingle<{ title: string | null; title_i18n: unknown }>();
    if (error) {
      // A name that cannot be read is simply not shown; the page and the invite still work.
      logServerError("reviews/offering/title", error);
      return null;
    }
    const title = (data?.title ?? "").trim();
    if (!title) return null;
    return localizedServiceTitle({ title, title_i18n: data?.title_i18n }, locale, title);
  } catch (err) {
    logServerError("reviews/offering/title", err);
    return null;
  }
}

/** The language the booking was made in (stamped on its source inquiry), or null. */
export async function bookingLocaleOf(svc: SupabaseClient, bookingId: string | null): Promise<string | null> {
  if (!bookingId) return null;
  try {
    const { data: b, error: bErr } = await svc
      .from("agency_bookings")
      .select("source_inquiry_id")
      .eq("id", bookingId)
      .maybeSingle<{ source_inquiry_id: string | null }>();
    if (bErr) {
      logServerError("reviews/offering/locale", bErr);
      return null;
    }
    if (!b?.source_inquiry_id) return null;
    const { data: inq, error: inqErr } = await svc
      .from("inquiries")
      .select("source_context")
      .eq("id", b.source_inquiry_id)
      .maybeSingle<{ source_context: unknown }>();
    if (inqErr) {
      // No language known: the caller falls back to the browser's, then English.
      logServerError("reviews/offering/locale", inqErr);
      return null;
    }
    const c = (inq?.source_context ?? {}) as { locale?: unknown; guest_locale?: unknown };
    return normalizeBookingLocale(c.locale) ?? normalizeBookingLocale(c.guest_locale) ?? null;
  } catch (err) {
    logServerError("reviews/offering/locale", err);
    return null;
  }
}
