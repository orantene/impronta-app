/**
 * appointment_picker — the engine seam, with every dependency injected.
 *
 * The `.server.ts` next to this binds the real client, the real identity and
 * the real engines; the tests bind fakes. Nothing here reads a header or a
 * cookie, and nothing here creates a client, which is what makes the seam
 * assertable without a database.
 *
 * WHAT IS REUSED, NOT REBUILT
 *   services   `loadPublicBookableOfferings` (the /book page's own list, with
 *              the booking mode already resolved per host)
 *   slots      `computePublicSlots` over `talent_booking_hours` + busy
 *              intervals — the same function the slots route runs
 *   booking    `placeInstantPurchase` → `createPurchase` (slot hold, capacity,
 *              identity, deposit policy, transaction) — the ONE pipeline
 *   checkout   `createCheckoutSessionForTransaction` (mock provider on QA)
 *   manage     `signBookingManageToken`, one token per action
 *
 * THE INSTANT IS RE-DERIVED. The island sends a start it was shown; this
 * recomputes what the person's hours offer that day and refuses anything not
 * in the list. Whether the slot is still free is decided by the pipeline's
 * hold under the pool's lock, never here.
 */

import type { BusyInterval } from "@/lib/scheduling/slots";
import { computePublicSlots } from "@/lib/scheduling/public-slots";
import { parseBookingHours } from "@/lib/scheduling/hours-types";
import { addUtcDays, utcToZonedYmd } from "@/lib/scheduling/tz";
import type { InstantPurchaseInput, InstantPurchaseResult } from "@/lib/scheduling/instant-purchase";
import type { CheckoutSessionInput, CheckoutSessionResult } from "@/lib/payments/stripe-checkout";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import type { TalentBookingMode } from "@/lib/scheduling/booking-surface";

import type { StorefrontAdmin } from "./admin";
import type { IdempotentRunner } from "./idempotent";
import { mapEngineRefusal } from "./refusals";
import type { StorefrontIdentity } from "./request-context";
import type {
  AppointmentAvailability,
  AppointmentPerson,
  AppointmentPickerData,
  AppointmentPickerDone,
  AppointmentPickerInput,
  AppointmentPickerProps,
  AppointmentPickerResult,
  AppointmentService,
  AppointmentSlot,
} from "./appointment-picker.types";

export type BookableOffering = TalentOffering & {
  bookingMode: TalentBookingMode;
  seatsLabel: string | null;
};

export type AppointmentPickerDeps = {
  admin: StorefrontAdmin;
  runner: IdempotentRunner;
  identity: StorefrontIdentity;
  locale: "en" | "es";
  /** `https://host`, for checkout return URLs and manage links. */
  origin: string | null;
  now?: () => Date;
  loadOfferings: (tenantId: string, locale: string) => Promise<BookableOffering[]>;
  /** id → portrait url. Cosmetic; a failure is an empty map, never a refusal. */
  loadPortraits: (tenantId: string, personIds: string[]) => Promise<Map<string, string>>;
  loadBusy: (input: {
    admin: StorefrontAdmin;
    talentProfileId: string;
    from: Date;
    to: Date;
    now?: Date;
  }) => Promise<BusyInterval[]>;
  placePurchase: (admin: StorefrontAdmin, input: InstantPurchaseInput) => Promise<InstantPurchaseResult>;
  createCheckout: (input: CheckoutSessionInput) => Promise<CheckoutSessionResult>;
  signManageToken: (input: {
    bookingId: string;
    tenantId: string;
    action: "cancel" | "reschedule";
  }) => string | null;
};

const MAX_DAYS = 60;
const DEFAULT_DAYS = 7;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toService(o: BookableOffering): AppointmentService {
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    durationMinutes: o.durationMinutes,
    amountCents: o.amountCents,
    currency: o.currency || "USD",
    depositPct: o.reserveMode === "deposit" ? o.depositPct : null,
    allowPayInPerson: o.allowPayInPerson,
    personId: o.talentProfileId,
    bookingMode: o.bookingMode,
    seatsLabel: o.seatsLabel,
  };
}

function clampDays(raw: unknown): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.max(1, n));
}

/** `from` for the slot window: the requested day at 00:00 UTC, never the past. */
function windowStart(day: string | null | undefined, now: Date): Date {
  if (day && YMD.test(day)) {
    const [y, m, d] = day.split("-").map(Number);
    const at = new Date(Date.UTC(y!, m! - 1, d!));
    // A day in the past is today: the person asked for a day, not for history.
    return at.getTime() < now.getTime() - 86_400_000 ? now : at;
  }
  return now;
}

type SlotRead =
  | { ok: true; availability: AppointmentAvailability }
  | { ok: false; code: string };

async function readSlots(
  deps: AppointmentPickerDeps,
  tenantId: string,
  service: AppointmentService,
  day: string | null | undefined,
  days: number,
): Promise<SlotRead> {
  const now = (deps.now ?? (() => new Date()))();
  if (service.bookingMode !== "instant") {
    return {
      ok: true,
      availability: { offeringId: service.id, timezone: "UTC", days: [], emptyReason: "inquiry_only" },
    };
  }
  if (!service.personId) {
    // A house service has no hours source yet (`talent_booking_hours` is per
    // person). Listed, priced, but booked through the inquiry form.
    return {
      ok: true,
      availability: { offeringId: service.id, timezone: "UTC", days: [], emptyReason: "not_bookable_here" },
    };
  }
  const { data: hoursRow, error } = await deps.admin
    .from("talent_booking_hours")
    .select(
      "timezone, weekly, exceptions, slot_minutes, buffer_before_min, buffer_after_min, min_notice_min, horizon_days",
    )
    .eq("talent_profile_id", service.personId)
    .maybeSingle();
  if (error) return { ok: false, code: "unavailable" };
  const hours = parseBookingHours(hoursRow);
  if (!hours) {
    return {
      ok: true,
      availability: {
        offeringId: service.id,
        timezone: "UTC",
        days: [],
        emptyReason: "no_booking_hours",
      },
    };
  }
  const from = windowStart(day, now);
  const horizon = Math.min(days, hours.horizonDays);
  const startYmd = utcToZonedYmd(from, hours.timezone) ?? from.toISOString().slice(0, 10);
  const endYmd = addUtcDays(startYmd, horizon) ?? startYmd;
  const to = new Date(`${endYmd}T23:59:59.999Z`);
  const busy = await deps.loadBusy({ admin: deps.admin, talentProfileId: service.personId, from, to, now });
  const duration =
    typeof service.durationMinutes === "number" && service.durationMinutes > 0
      ? service.durationMinutes
      : hours.slotMinutes;
  const computed = computePublicSlots({ hours, durationMinutes: duration, from, days: horizon, busy });

  const byDay = new Map<string, AppointmentSlot[]>();
  for (const iso of computed.starts) {
    const start = new Date(iso);
    const ymd = utcToZonedYmd(start, hours.timezone);
    if (!ymd) continue;
    const list = byDay.get(ymd) ?? [];
    list.push({
      startsAtIso: start.toISOString(),
      endsAtIso: new Date(start.getTime() + duration * 60_000).toISOString(),
    });
    byDay.set(ymd, list);
  }
  return {
    ok: true,
    availability: {
      offeringId: service.id,
      timezone: hours.timezone,
      days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, slots]) => ({ date, slots })),
      emptyReason: computed.starts.length === 0 ? computed.reason : null,
    },
  };
}

async function readPeople(
  deps: AppointmentPickerDeps,
  tenantId: string,
  services: AppointmentService[],
): Promise<AppointmentPerson[]> {
  const ids = [...new Set(services.map((s) => s.personId).filter((x): x is string => !!x))];
  if (ids.length === 0) return [];
  const { data, error } = await deps.admin
    .from("talent_profiles")
    .select("id, display_name")
    .in("id", ids);
  if (error) return [];
  let portraits = new Map<string, string>();
  try {
    portraits = await deps.loadPortraits(tenantId, ids);
  } catch {
    portraits = new Map();
  }
  const rows = (data ?? []) as Array<{ id: string; display_name: string | null }>;
  return rows.map((r) => ({
    id: r.id,
    name: (r.display_name ?? "").trim(),
    imageUrl: portraits.get(r.id) ?? null,
    serviceIds: services.filter((s) => s.personId === r.id).map((s) => s.id),
  }));
}

export async function readAppointmentPickerCore(
  deps: AppointmentPickerDeps,
  tenantId: string,
  props: AppointmentPickerProps,
): Promise<{ ok: true; data: AppointmentPickerData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  try {
    const offerings = await deps.loadOfferings(tenantId, deps.locale);
    const wanted = Array.isArray(props.offeringIds) ? new Set(props.offeringIds) : null;
    const services = offerings
      .filter((o) => (wanted ? wanted.has(o.id) : true))
      .filter((o) => o.kind !== "product")
      .map(toService);

    const people = await readPeople(deps, tenantId, services);

    const { data: venueRows, error: venueError } = await deps.admin
      .from("venues")
      .select("id, name, timezone, address_line1, city, is_default, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("is_default", { ascending: false });
    if (venueError) return { ok: false, reason: "unavailable" };
    const locations = ((venueRows ?? []) as Array<Record<string, unknown>>).map((v) => ({
      id: String(v.id),
      name: String(v.name ?? ""),
      timezone: String(v.timezone ?? "UTC"),
      addressLine:
        [v.address_line1, v.city]
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
          .join(", ") || null,
      isDefault: v.is_default === true,
    }));

    let availability: AppointmentAvailability | null = null;
    if (props.offeringId) {
      const service = services.find((s) => s.id === props.offeringId);
      if (!service) return { ok: false, reason: "not_sellable" };
      const read = await readSlots(deps, tenantId, service, props.day, clampDays(props.days));
      if (!read.ok) return { ok: false, reason: read.code };
      availability = read.availability;
    }

    const prefill =
      deps.identity.userId && (deps.identity.email || deps.identity.displayName)
        ? { name: deps.identity.displayName, email: deps.identity.email }
        : null;

    return {
      ok: true,
      data: {
        services,
        people,
        locations,
        timezone: locations.find((l) => l.isDefault)?.timezone ?? locations[0]?.timezone ?? null,
        availability,
        prefill,
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function validInput(input: AppointmentPickerInput): string | null {
  if (!UUID.test(input.tenantId) || !UUID.test(input.offeringId)) return "invalid_request";
  if (typeof input.clientOrderKey !== "string" || input.clientOrderKey.length < 8) return "invalid_request";
  if (Number.isNaN(Date.parse(input.startsAtIso ?? ""))) return "invalid_request";
  if (!["full", "deposit", "in_person"].includes(input.payment)) return "invalid_request";
  return null;
}

function contactGiven(input: AppointmentPickerInput): boolean {
  const c = input.contact ?? { name: "", email: "" };
  return Boolean((c.email ?? "").trim() || (c.phone ?? "").trim()) && Boolean((c.name ?? "").trim());
}

export async function actAppointmentPickerCore(
  deps: AppointmentPickerDeps,
  input: AppointmentPickerInput,
): Promise<AppointmentPickerResult> {
  const invalid = validInput(input);
  if (invalid) return mapEngineRefusal(invalid, deps.locale);
  // Money does not need a name; a calendar hold does. The booking is on a
  // person's calendar and they need someone to call, so identity is demanded
  // before any engine is touched rather than discovered as a CHECK violation.
  if (!contactGiven(input)) return mapEngineRefusal("identity_required", deps.locale);

  const outcome = await deps.runner<AppointmentPickerResult>({
    command: "storefront.appointment.book",
    tenantId: input.tenantId,
    actorUserId: deps.identity.userId,
    key: input.clientOrderKey,
    args: {
      offeringId: input.offeringId,
      startsAtIso: input.startsAtIso,
      email: input.contact.email.trim().toLowerCase(),
      payment: input.payment,
    },
    run: () => book(deps, input),
  });
  switch (outcome.status) {
    case "ok":
      return outcome.result.ok ? { ...outcome.result, replayed: outcome.replayed } : outcome.result;
    case "refused":
      return outcome.result;
    case "conflict":
      return mapEngineRefusal(outcome.code, deps.locale);
    case "error":
      return mapEngineRefusal("engine_error", deps.locale);
  }
}

async function book(deps: AppointmentPickerDeps, input: AppointmentPickerInput): Promise<AppointmentPickerResult> {
  const offerings = await deps.loadOfferings(input.tenantId, deps.locale);
  const service = offerings.map(toService).find((s) => s.id === input.offeringId);
  if (!service) return mapEngineRefusal("not_sellable", deps.locale);
  if (service.bookingMode !== "instant") return mapEngineRefusal("inquiry_only", deps.locale);
  if (!service.personId) return mapEngineRefusal("not_bookable_here", deps.locale);
  if (input.personId && input.personId !== service.personId) {
    return mapEngineRefusal("not_sellable", deps.locale);
  }

  const now = (deps.now ?? (() => new Date()))();
  const startsAt = new Date(input.startsAtIso);
  if (startsAt.getTime() <= now.getTime()) return mapEngineRefusal("past", deps.locale);

  // Re-derived: the day's offer, and the sent instant must be in it.
  const read = await readSlots(deps, input.tenantId, service, startsAt.toISOString().slice(0, 10), 2);
  if (!read.ok) return mapEngineRefusal(read.code, deps.locale);
  const slot = read.availability.days
    .flatMap((d) => d.slots)
    .find((s) => Date.parse(s.startsAtIso) === startsAt.getTime());
  if (!slot) {
    return mapEngineRefusal(read.availability.emptyReason ?? "time_not_offered", deps.locale);
  }

  const placed = await deps.placePurchase(deps.admin, {
    tenantId: input.tenantId,
    offeringId: service.id,
    talentProfileId: service.personId,
    actorUserId: deps.identity.userId,
    contact: {
      email: input.contact.email.trim().toLowerCase(),
      phone: input.contact.phone?.trim() || null,
      displayName: input.contact.name.trim(),
    },
    quantity: 1,
    variantId: null,
    addOnIds: [],
    reservation: { startsAt: slot.startsAtIso, endsAt: slot.endsAtIso },
    // INTENT. `full` vs `deposit` is decided by the offering's reserve_mode in
    // the pipeline; only pay-in-person is a choice the person can make.
    payInPerson: input.payment === "in_person",
    sourceChannel: "storefront_appointment",
    sourcePage: input.sourcePage ?? null,
    clientOrderKey: input.clientOrderKey,
    openThread: true,
  });
  if (!placed.ok) return mapEngineRefusal(placed, deps.locale);

  let checkoutUrl: string | null = null;
  if (placed.collectCents > 0 && placed.transactionId && placed.bookingId && deps.origin) {
    const session = await deps.createCheckout({
      transactionId: placed.transactionId,
      amountCents: placed.collectCents,
      currency: service.currency,
      payerEmail: input.contact.email.trim().toLowerCase(),
      inquiryId: placed.inquiryId,
      bookingId: placed.bookingId,
      // The same return pages the instant-book action uses.
      successUrl: `${deps.origin}/checkout/success`,
      cancelUrl: `${deps.origin}/checkout/cancel`,
      description: service.title,
      locale: deps.locale,
    });
    if (session.ok) checkoutUrl = session.url;
  }

  const manage = (action: "cancel" | "reschedule") => {
    if (!placed.bookingId || !deps.origin) return null;
    const token = deps.signManageToken({ bookingId: placed.bookingId, tenantId: input.tenantId, action });
    return token ? `${deps.origin}/manage/${encodeURIComponent(token)}` : null;
  };

  const person = await deps.admin
    .from("talent_profiles")
    .select("id, display_name")
    .eq("id", service.personId)
    .maybeSingle();
  const personName =
    person && !person.error && person.data && typeof person.data.display_name === "string"
      ? person.data.display_name
      : null;

  const done: AppointmentPickerDone = {
    ok: true,
    orderId: placed.orderId,
    bookingId: placed.bookingId,
    collectCents: placed.collectCents,
    checkoutUrl,
    manage: { cancelUrl: manage("cancel"), rescheduleUrl: manage("reschedule") },
    confirmation: {
      serviceTitle: service.title,
      personName,
      startsAtIso: slot.startsAtIso,
      endsAtIso: slot.endsAtIso,
      timezone: read.availability.timezone,
    },
    replayed: false,
  };
  return done;
}
