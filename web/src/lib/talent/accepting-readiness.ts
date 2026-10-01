/**
 * WSF-C — "am I taking new work" switches and instant-booking readiness.
 * PURE, safe on server and client. Report §1 row 4, §7, §8; QA Q2/Q3/Q4/Q6.
 *
 * The switches live on `talent_sites` (parseTalentSiteSwitches). They apply
 * to the talent's DIRECT channels only: their own website and the Tulala
 * profile page. Agency-routed bookings, existing threads, replies, manage
 * links and existing bookings are never touched (§7).
 */

import type { TalentSiteSwitches } from "@/lib/talent/site-switches";

/** Refusal codes a direct POST gets back (Q4). */
export const NOT_ACCEPTING_BOOKINGS = "not_accepting_bookings" as const;
export const NOT_ACCEPTING_INQUIRIES = "not_accepting_inquiries" as const;
export type AcceptingRefusalCode = typeof NOT_ACCEPTING_BOOKINGS | typeof NOT_ACCEPTING_INQUIRIES;

export type AcceptingSwitches = Pick<TalentSiteSwitches, "acceptingBookings" | "acceptingInquiries">;

// ── Readiness (§1 row 4) ────────────────────────────────────────────────────

/** What an effective instant mode still needs. */
export type ReadinessGap = "plan" | "working_hours" | "duration" | "payouts";

/**
 * What is missing before instant booking can work. Empty = ready.
 *  - working hours: `talent_booking_hours` has at least one open window;
 *  - duration: the service has minutes (skipped for products, and when the
 *    caller is asking at talent level with `durationMinutes` undefined);
 *  - payouts: only when booking takes money online (deposit or full), the
 *    platform checkout must be able to charge (online-collect-ready.ts).
 */
export function readinessGaps(input: {
  kind?: string | null;
  hasWorkingHours: boolean;
  /** undefined = talent-level question, no service in hand. */
  durationMinutes?: number | null;
  takesMoneyOnline: boolean;
  payoutsReady: boolean;
  /**
   * F27: the talent's plan allows instant booking (the free tier caps at
   * request). undefined = not asked, treated as allowed.
   */
  planAllowsInstant?: boolean;
}): ReadinessGap[] {
  if (input.planAllowsInstant === false) return ["plan"];
  if (input.kind === "product") {
    return input.takesMoneyOnline && !input.payoutsReady ? ["payouts"] : [];
  }
  const gaps: ReadinessGap[] = [];
  if (!input.hasWorkingHours) gaps.push("working_hours");
  if (input.durationMinutes !== undefined && !((input.durationMinutes ?? 0) > 0)) gaps.push("duration");
  if (input.takesMoneyOnline && !input.payoutsReady) gaps.push("payouts");
  return gaps;
}

/** The shape resolveEffectiveBookingMode takes. */
export function instantReadiness(gaps: readonly ReadinessGap[]): { instantReady: boolean } {
  return { instantReady: gaps.length === 0 };
}

/** Reserve modes that take money when the client books. */
export function takesMoneyOnline(reserveMode: string | null | undefined, payInPerson = false): boolean {
  if (payInPerson) return false;
  return reserveMode === "deposit" || reserveMode === "full";
}

/** Settings copy for each gap. Translated by the settings i18n map. */
export const READINESS_GAP_COPY: Record<ReadinessGap, string> = {
  plan: "Instant booking is not available on this plan",
  working_hours: "Add working hours to turn on instant booking",
  duration: "Add a duration to this service to turn on instant booking",
  // PAY-2 Option B — platform Checkout, not Connect. Connect unfinished
  // must not invent this gap when STRIPE_SECRET_KEY is present.
  payouts: "Turn on online payments to take deposits",
};

// ── Public effect of the switches (§8) ──────────────────────────────────────

export type PublicContactMode = "open" | "bookings_paused" | "inquiries_paused" | "portfolio_only";

export function publicContactMode(s: AcceptingSwitches): PublicContactMode {
  if (!s.acceptingBookings && !s.acceptingInquiries) return "portfolio_only";
  if (!s.acceptingBookings) return "bookings_paused";
  if (!s.acceptingInquiries) return "inquiries_paused";
  return "open";
}

/**
 * The public path of one service once the switches apply, given its
 * effective mode from resolveEffectiveBookingMode. `none` = no button.
 *  - bookings off: every service becomes an inquiry (Consultar), or none
 *    when inquiries are off too;
 *  - inquiries off: an inquiry service has no route and hides; booking
 *    paths keep working.
 */
export function applySwitchesToMode(
  mode: "instant" | "request" | "inquiry" | "closed",
  s: AcceptingSwitches,
): "instant" | "request" | "inquiry" | "none" {
  if (!s.acceptingBookings || mode === "closed") return s.acceptingInquiries ? "inquiry" : "none";
  if (mode === "inquiry" && !s.acceptingInquiries) return "none";
  return mode;
}

/** Banner line for the public menu / profile. null when nothing is paused. */
export function pauseBannerCopy(mode: PublicContactMode, locale: string): string | null {
  const es = locale.toLowerCase().startsWith("es");
  if (mode === "bookings_paused") {
    return es
      ? "No estoy tomando nuevas reservas por ahora. Puedes consultarme."
      : "Not taking new bookings right now. You can still send an inquiry.";
  }
  if (mode === "portfolio_only") {
    return es
      ? "No estoy tomando reservas ni consultas nuevas por ahora."
      : "Not taking new bookings or inquiries right now.";
  }
  return null;
}

// ── Save impact (Q3, owner correction) ──────────────────────────────────────

/**
 * Services that will show as unavailable after this save: bookings on,
 * inquiries off, and the service's effective mode is inquiry (its only route
 * is gone). Never a block: a temporarily unavailable service, or a whole
 * portfolio-only pause, is a valid choice. The screen explains the impact.
 */
export function switchSaveImpact(input: {
  switches: AcceptingSwitches;
  services: ReadonlyArray<{ id: string; effectiveMode: "instant" | "request" | "inquiry" | "closed" }>;
}): { unavailableIds: string[] } {
  const { acceptingBookings, acceptingInquiries } = input.switches;
  if (!acceptingBookings || acceptingInquiries) return { unavailableIds: [] };
  return { unavailableIds: input.services.filter((s) => s.effectiveMode === "inquiry").map((s) => s.id) };
}

// ── Channel scope (§7) ──────────────────────────────────────────────────────

/**
 * Is this a DIRECT channel to the talent (their own site or the Tulala
 * profile on the hub)? An agency host, or an agency storefront path on the
 * hub, is agency-routed and never gated. Unknown hosts fail open (not gated).
 */
export function isDirectTalentChannel(input: {
  hostKind: string;
  hostTenantId: string | null;
  tenantId: string | null;
}): boolean {
  if (input.hostKind === "talent_site") return true;
  if (input.hostKind === "hub") return !!input.tenantId && input.tenantId === input.hostTenantId;
  return false;
}

/**
 * Channel of a services_catalog render. Only the talent's own site render
 * passes the talent explicitly; an agency tenant's homepage (and its editor
 * preview) is agency-routed, so the talent's switches and banner never apply
 * there (§7).
 */
export function servicesCatalogChannel(input: { explicitTalentProfileId?: string | null }): "direct" | "agency" {
  return input.explicitTalentProfileId ? "direct" : "agency";
}

/**
 * A NEW conversation opened on a direct channel. A booking request (a time
 * or a reserve intent is attached) is a new booking; anything else is a new
 * inquiry. Replies to existing threads never come through here.
 */
export function assertAcceptingNewContact(
  s: AcceptingSwitches,
  kind: "booking_request" | "inquiry",
): { ok: true } | { ok: false; reason: AcceptingRefusalCode } {
  if (kind === "booking_request") {
    return s.acceptingBookings ? { ok: true } : { ok: false, reason: NOT_ACCEPTING_BOOKINGS };
  }
  return s.acceptingInquiries ? { ok: true } : { ok: false, reason: NOT_ACCEPTING_INQUIRIES };
}
