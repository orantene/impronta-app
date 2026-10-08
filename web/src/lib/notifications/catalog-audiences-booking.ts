import "server-only";

import { formatAppointmentWhen, normalizeBookingLocale } from "@/lib/scheduling/booking-locale";
import { logServerError } from "@/lib/server/safe-error";
import { clientOrGuest, loadInquiryView, str } from "./catalog-audiences";
import type { AudienceContext, AudienceMember, NotificationEvent } from "./types";

/**
 * booking.confirmed audience + hydrator (TUL-93).
 *
 * RULE: the guest confirmation goes to the address TYPED IN THE BOOKING FORM.
 * `clientOrGuest` prefers the inquiry's linked client account, which is right
 * for a thread reply but wrong here: a business account signed in on the shared
 * cookie used to be attached as the client, so the confirmation went to the
 * business inbox. The linked account is used only when its own address is the
 * typed one.
 */
export function pickBookingClientMember(input: {
  clientUserId: string | null;
  /** The linked auth user's email; null when unknown or the lookup failed. */
  authEmail: string | null;
  contactEmail: string | null;
  contactName: string | null;
  locale: string | null;
}): AudienceMember | null {
  const locale = normalizeBookingLocale(input.locale) ?? undefined;
  const typed = input.contactEmail?.trim() || null;
  if (!typed) {
    return input.clientUserId
      ? { kind: "user", userId: input.clientUserId, role: "client", locale }
      : null;
  }
  const sameAccount =
    input.clientUserId !== null &&
    input.authEmail !== null &&
    input.authEmail.trim().toLowerCase() === typed.toLowerCase();
  if (sameAccount && input.clientUserId) {
    return { kind: "user", userId: input.clientUserId, role: "client", locale };
  }
  return { kind: "guest", email: typed, displayName: input.contactName, role: "client", locale };
}

export const bookingConfirmedClient = async (
  event: NotificationEvent,
  ctx?: AudienceContext,
): Promise<AudienceMember[]> => {
  const clientUserId = str(event.payload.clientUserId);
  const contactEmail = str(event.payload.contactEmail);
  if (!contactEmail) return clientOrGuest(event, ctx);
  let authEmail: string | null = null;
  if (clientUserId && ctx) {
    try {
      const { data, error } = await ctx.admin.auth.admin.getUserById(clientUserId);
      if (error) logServerError("notifications.bookingConfirmed.getUser", error);
      authEmail = data?.user?.email?.trim() || null;
    } catch (err) {
      logServerError("notifications.bookingConfirmed.getUser", err);
    }
  }
  const member = pickBookingClientMember({
    clientUserId,
    authEmail,
    contactEmail,
    contactName: str(event.payload.contactName),
    locale: str(event.payload.locale),
  });
  return member ? [member] : [];
};

/**
 * `loadInquiryView` + the appointment as it was booked: `eventDate` becomes
 * "mié 14 oct, 13:30 - 14:30" in the talent's zone so the confirmation shows
 * the time the guest picked.
 */
export async function loadBookingConfirmedView(
  event: NotificationEvent,
  ctx: AudienceContext,
): Promise<Record<string, unknown>> {
  const base = await loadInquiryView(event, ctx);
  const bookingId = str(event.payload.bookingId);
  if (!bookingId || !event.tenantId) return base;
  const { data, error } = await ctx.admin
    .from("agency_bookings")
    .select("starts_at, ends_at, timezone")
    .eq("id", bookingId)
    .eq("tenant_id", event.tenantId)
    .maybeSingle();
  if (error) {
    logServerError("notifications.bookingConfirmed.window", error);
    return base;
  }
  const row = data as
    | { starts_at: string | null; ends_at: string | null; timezone: string | null }
    | null;
  if (!row?.starts_at) return base;
  const when = formatAppointmentWhen({
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timeZone: row.timezone,
    locale: str(base.locale),
  });
  return when ? { ...base, eventDate: when } : base;
}
