/**
 * TUL-21: what an assistant gets back from the booking tools. Pure.
 *
 * The hand-off link is the talent page with the signed `?service=` choice the
 * storefront already uses (talent-offering-intent.ts, 30-minute expiry). The
 * page opens the chat with that service chosen; the person sends the request.
 */

import type { PublicOpenTimesResult } from "@/lib/scheduling/public-open-times";

/** Matches the signed choice's own expiry in talent-offering-intent.ts. */
export const AGENT_HANDOFF_TTL_MS = 30 * 60 * 1000;
export const AGENT_SLOTS_MAX = 60;

export type AgentBookingRefusal = "not_bookable" | "agent_booking_off" | "not_accepting_bookings";

/** Why request_booking refuses this talent / service, or null to proceed. */
export function agentBookingRefusal(input: {
  serviceBookable: boolean;
  agentBookingEnabled: boolean;
  acceptingBookings: boolean;
}): AgentBookingRefusal | null {
  if (!input.agentBookingEnabled) return "agent_booking_off";
  if (!input.acceptingBookings) return "not_accepting_bookings";
  if (!input.serviceBookable) return "not_bookable";
  return null;
}

export function agentHandoffUrl(origin: string, basePath: string, token: string): string {
  const path = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return `${origin.replace(/\/+$/, "")}${path}?service=${encodeURIComponent(token)}`;
}

function localLabel(iso: string, timeZone: string | undefined, locale: string): string | null {
  if (!timeZone) return null;
  try {
    return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function agentOpenTimesView(
  result: Extract<PublicOpenTimesResult, { ok: true }>,
  locale: string,
): {
  timezone: string | null;
  mode: string | null;
  slots: { starts_at: string; local: string | null }[];
  more: boolean;
  reason: string | null;
} {
  const slots = result.slots.slice(0, AGENT_SLOTS_MAX).map((s) => ({
    starts_at: s,
    local: localLabel(s, result.timezone, locale),
  }));
  return {
    timezone: result.timezone ?? null,
    mode: result.mode ?? null,
    slots,
    more: result.slots.length > AGENT_SLOTS_MAX,
    reason: result.slots.length === 0 ? (result.reason ?? null) : null,
  };
}
