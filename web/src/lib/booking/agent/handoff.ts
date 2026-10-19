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
  /** An agency host owns its routing: the talent's pause never applies there (as in open times). */
  agencyHost?: boolean;
}): AgentBookingRefusal | null {
  if (!input.agentBookingEnabled) return "agent_booking_off";
  if (!input.acceptingBookings && !input.agencyHost) return "not_accepting_bookings";
  if (!input.serviceBookable) return "not_bookable";
  return null;
}

/**
 * Which catalog the agent may offer. The hand-off chat lands in one tenant and
 * only seeds that tenant's offerings, so services from any other tenant would
 * give a link that silently drops the chosen service. No tenant → nothing.
 */
export function agentCatalogScope(
  hostKind: string,
  handoffTenantId: string | null,
): { tenantId: string; channel: "agency" | "direct" } | null {
  if (!handoffTenantId) return null;
  return { tenantId: handoffTenantId, channel: hostKind === "agency" ? "agency" : "direct" };
}

/** A handoff id is a random v4 uuid minted per request_booking call. */
export const AGENT_HANDOFF_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AgentRequestStatus = "link_not_used" | "sent" | "accepted" | "declined" | "expired";

/**
 * Coarse status an assistant may see for a hand-off. Derived from the inquiry's
 * status only. null inquiry: the person has not opened the link and sent a message.
 */
export function agentRequestStatus(inquiryStatus: string | null): AgentRequestStatus {
  switch (inquiryStatus) {
    case null:
      return "link_not_used";
    case "approved":
    case "booked":
    case "converted":
      return "accepted";
    case "rejected":
      return "declined";
    case "expired":
    case "closed":
    case "archived":
      return "expired";
    default:
      return "sent";
  }
}

/** The only fields get_request_status may return. Never client identity or message text. */
export function agentRequestStatusView(status: AgentRequestStatus, linkExpiresAtMs: number | null, nowMs: number) {
  // An unused link is "expired" once the signed intent's own lifetime has passed.
  const effective: AgentRequestStatus =
    status === "link_not_used" && linkExpiresAtMs !== null && nowMs > linkExpiresAtMs ? "expired" : status;
  return { status: effective };
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
