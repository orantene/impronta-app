/**
 * appointment_picker — the types the island codes against.
 *
 * Five steps as sheets: service → person → day + time → details → confirm.
 * The reader answers the first three in one call (services, people, the days
 * with slots for one service); the act takes the booking.
 */

import type { StorefrontRefusal } from "./refusals";

export type AppointmentPickerProps = {
  /** Which services the block offers. `"all"` (default) = every bookable service. */
  offeringIds?: string[] | "all";
  /** `any` lets the engine pick the person; `pick` shows the people step. */
  staffMode?: "any" | "pick";
  showPrices?: boolean;
  /** Authored sentence shown on the confirm step when a deposit is due. */
  depositNotice?: string | null;
  /**
   * When set, the read also answers availability for this service from `day`
   * (the venue's calendar date, `YYYY-MM-DD`) for `days` days. Omit on the
   * first render; the island re-reads with them once a service is chosen.
   */
  offeringId?: string | null;
  day?: string | null;
  /** 1..60, default 7. */
  days?: number;
  locale?: string | null;
};

export type AppointmentService = {
  id: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  /** Null when the service is priced on request. */
  amountCents: number | null;
  currency: string;
  /** Percentage of the price collected at booking; null = pay in full. */
  depositPct: number | null;
  allowPayInPerson: boolean;
  /** The person whose calendar this books, or null for a house service. */
  personId: string | null;
  /** `instant` books here; `request`/`inquire` need the inquiry form. */
  bookingMode: "instant" | "request" | "inquire";
  seatsLabel: string | null;
};

export type AppointmentPerson = {
  id: string;
  name: string;
  imageUrl: string | null;
  serviceIds: string[];
};

export type AppointmentLocation = {
  id: string;
  name: string;
  timezone: string;
  addressLine: string | null;
  isDefault: boolean;
};

export type AppointmentSlot = {
  startsAtIso: string;
  endsAtIso: string;
};

export type AppointmentAvailability = {
  offeringId: string;
  /** IANA zone the slots are offered in. */
  timezone: string;
  /** Calendar dates in `timezone`, earliest first, each with its slots. */
  days: Array<{ date: string; slots: AppointmentSlot[] }>;
  /** Present only when every day is empty. */
  emptyReason:
    | "no_booking_hours"
    | "closed_in_window"
    | "fully_booked"
    | "inquiry_only"
    | "not_bookable_here"
    | null;
};

export type AppointmentPickerData = {
  services: AppointmentService[];
  people: AppointmentPerson[];
  locations: AppointmentLocation[];
  /** The workspace's default zone; the island formats with the availability's when present. */
  timezone: string | null;
  availability: AppointmentAvailability | null;
  /** A signed-in customer, prefilled into the details step. */
  prefill: { name: string | null; email: string | null } | null;
};

export type AppointmentPickerInput = {
  tenantId: string;
  offeringId: string;
  /** Required for a person-owned service; the reader's `personId`. */
  personId?: string | null;
  /** A slot the reader offered. Re-derived server-side, never trusted. */
  startsAtIso: string;
  contact: { name: string; email: string; phone?: string | null };
  /** INTENT. The offering's policy decides what is allowed. */
  payment: "full" | "deposit" | "in_person";
  note?: string | null;
  /** Per CART, not per click. Regenerate for a different booking. */
  clientOrderKey: string;
  locale?: string | null;
  sourcePage?: string | null;
};

export type AppointmentPickerDone = {
  ok: true;
  orderId: string;
  bookingId: string | null;
  /** Integer cents being collected now; 0 for pay-in-person or a free service. */
  collectCents: number;
  /** Present when there is money to collect; the island navigates here. */
  checkoutUrl: string | null;
  /**
   * The customer's self-manage links (`/manage/<token>`), one per action
   * because a token authorises exactly one. Null when the booking has no
   * operations anchor yet or the signing secret is absent.
   */
  manage: { cancelUrl: string | null; rescheduleUrl: string | null };
  confirmation: {
    serviceTitle: string;
    personName: string | null;
    startsAtIso: string;
    endsAtIso: string;
    timezone: string;
  };
  /** True when this key had already succeeded and the same result was returned. */
  replayed: boolean;
};

export type AppointmentPickerResult = AppointmentPickerDone | StorefrontRefusal;
