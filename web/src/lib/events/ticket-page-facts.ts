/**
 * ticket-page-facts.ts — everything `/ticket/<code>` shows besides the QR,
 * read once from the admission outward.
 *
 * Reads only. The admission is already verified (signed token, current
 * version, this tenant) by `loadTicketByCode`; this walks from it to the
 * order line (tier label, money), the order (receipt, siblings), the session
 * (the night), the event (title, doors, cover, refund switch), the venue
 * (name, city, zone) and the workspace (zone, locale, name).
 *
 * EVERY READ ACTS ON ITS ERROR, AND A FAILED READ REFUSES. PostgREST does
 * not throw; a denied policy or a bad column arrives as `{ data: null,
 * error }`, and a ticket page printing no night and no venue would read as
 * a ticket with none. So any read error is logged with WHERE it failed and
 * the whole load returns null; the page then refuses (404) rather than
 * rendering the gap as a fact (main's c1ecc2f6b contract). An absent row
 * (a comp with no order line, an event with no cover) is not an error and
 * degrades to null on its own.
 *
 * Tests inject a scripted PostgREST fake (the `ticket-delivery.test.ts`
 * shape), so the client type is deliberately loose.
 */

import { logServerError } from "@/lib/server/safe-error";
import { resolvePublicZone } from "./public-event-time";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FactsAdmin = { from: (table: string) => any };

export type TicketPageFacts = {
  eventId: string | null;
  eventTitle: string | null;
  eventSlug: string | null;
  eventStatus: string | null;
  eventDescription: string | null;
  doorsOffsetMinutes: number;
  coverUrl: string | null;
  /** The CMS page the event points at (`events.page_id`), when it is published. */
  pageSlug: string | null;
  refundsOpen: boolean;
  refundPolicyKey: string | null;
  refundsCloseAt: string | null;
  sessionStartsAt: string | null;
  venueName: string | null;
  venueCity: string | null;
  /** Venue's zone, else the workspace's; null means no clock is drawn. */
  timeZone: string | null;
  workspaceName: string | null;
  workspaceLocale: string | null;
  tierLabel: string | null;
  partySize: number;
  seatLabel: string | null;
  admittedCount: number;
  orderId: string | null;
  orderLineId: string | null;
  orderStatus: string | null;
  receiptCode: string | null;
  lineTotalCents: number;
  lineRefundedCents: number;
  /** Every admission the same order minted, for "n of m". */
  siblings: Array<{ id: string; lineSeq: number | null }>;
  /** A refund intent already exists for this line (any source). */
  refundRequested: boolean;
};

/** A PostgREST read that arrived as an error: the load refuses, it never renders the gap as an empty fact. */
class FactsReadError extends Error {
  constructor(
    public readonly at: string,
    public readonly detail: unknown,
  ) {
    super(`ticket.facts/${at}`);
  }
}

async function one<T>(label: string, q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T | null> {
  const { data, error } = await q;
  if (error) throw new FactsReadError(label, error);
  return (data ?? null) as T | null;
}

async function many<T>(label: string, q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new FactsReadError(label, error);
  return (data ?? []) as T[];
}

const EMPTY: TicketPageFacts = {
  eventId: null,
  eventTitle: null,
  eventSlug: null,
  eventStatus: null,
  eventDescription: null,
  doorsOffsetMinutes: 0,
  coverUrl: null,
  pageSlug: null,
  refundsOpen: false,
  refundPolicyKey: null,
  refundsCloseAt: null,
  sessionStartsAt: null,
  venueName: null,
  venueCity: null,
  timeZone: null,
  workspaceName: null,
  workspaceLocale: null,
  tierLabel: null,
  partySize: 1,
  seatLabel: null,
  admittedCount: 0,
  orderId: null,
  orderLineId: null,
  orderStatus: null,
  receiptCode: null,
  lineTotalCents: 0,
  lineRefundedCents: 0,
  siblings: [],
  refundRequested: false,
};

export async function loadTicketPageFacts(
  admin: FactsAdmin,
  input: { tenantId: string; admissionId: string },
): Promise<TicketPageFacts | null> {
  try {
    return await readFacts(admin, input);
  } catch (err) {
    logServerError(
      `ticket.facts admission=${input.admissionId} at=${err instanceof FactsReadError ? err.at : "unknown"}`,
      err instanceof FactsReadError ? err.detail : err,
    );
    return null;
  }
}

async function readFacts(admin: FactsAdmin, input: { tenantId: string; admissionId: string }): Promise<TicketPageFacts> {
  const out: TicketPageFacts = { ...EMPTY, siblings: [] };
  const T = input.tenantId;

  const adm = await one<{
    session_id: string | null;
    order_line_id: string | null;
    party_size: number | null;
    space_id: string | null;
    admitted_count: number | null;
    starts_at: string | null;
  }>(
    "admission",
    admin.from("admissions").select("session_id, order_line_id, party_size, space_id, admitted_count, starts_at").eq("tenant_id", T).eq("id", input.admissionId).maybeSingle(),
  );
  if (!adm) return out;
  out.partySize = Math.max(1, Number(adm.party_size ?? 1));
  out.admittedCount = Math.max(0, Number(adm.admitted_count ?? 0));
  out.orderLineId = adm.order_line_id ?? null;
  out.sessionStartsAt = adm.starts_at ?? null;

  const [line, session, space, workspace, workspaceLocale] = await Promise.all([
    adm.order_line_id
      ? one<{ id: string; order_id: string; label: string | null; total_cents: number | null; refunded_cents: number | null }>(
          "line",
          admin.from("order_lines").select("id, order_id, label, total_cents, refunded_cents").eq("tenant_id", T).eq("id", adm.order_line_id).maybeSingle(),
        )
      : Promise.resolve(null),
    adm.session_id
      ? one<{ id: string; starts_at: string | null; event_id: string | null; venue_id: string | null }>(
          "session",
          admin.from("sessions").select("id, starts_at, event_id, venue_id").eq("tenant_id", T).eq("id", adm.session_id).maybeSingle(),
        )
      : Promise.resolve(null),
    adm.space_id
      ? one<{ name: string | null; code: string | null }>("space", admin.from("spaces").select("name, code").eq("tenant_id", T).eq("id", adm.space_id).maybeSingle())
      : Promise.resolve(null),
    one<{ timezone: string | null; display_name: string | null }>(
      "workspace",
      admin.from("agencies").select("timezone, display_name").eq("id", T).maybeSingle(),
    ),
    // The public site's default locale lives on agency_business_identity, not
    // on agencies (`agencies.default_locale` does not exist; reading it 404'd
    // every guest ticket page on 2026-09-17). Same source ticket-delivery uses.
    one<{ default_locale: string | null }>(
      "workspace-locale",
      admin.from("agency_business_identity").select("default_locale").eq("tenant_id", T).maybeSingle(),
    ),
  ]);

  out.workspaceName = workspace?.display_name ?? null;
  out.workspaceLocale = workspaceLocale?.default_locale ?? null;
  out.seatLabel = space ? (space.name || space.code || null) : null;

  if (line) {
    out.tierLabel = line.label || null;
    out.orderId = line.order_id;
    out.lineTotalCents = Number(line.total_cents ?? 0);
    out.lineRefundedCents = Number(line.refunded_cents ?? 0);
  }
  if (session) {
    out.sessionStartsAt = session.starts_at ?? out.sessionStartsAt;
    out.eventId = session.event_id ?? null;
  }

  const [order, siblingLines, intents, event] = await Promise.all([
    out.orderId
      ? one<{ status: string | null; receipt_code: string | null }>("order", admin.from("orders").select("status, receipt_code").eq("tenant_id", T).eq("id", out.orderId).maybeSingle())
      : Promise.resolve(null),
    out.orderId ? many<{ id: string }>("siblingLines", admin.from("order_lines").select("id").eq("tenant_id", T).eq("order_id", out.orderId)) : Promise.resolve([]),
    out.orderLineId
      ? many<{ id: string }>("intents", admin.from("ticket_refund_intents").select("id").eq("tenant_id", T).eq("order_line_id", out.orderLineId))
      : Promise.resolve([]),
    out.eventId
      ? one<{
          id: string;
          title: string | null;
          slug: string | null;
          status: string | null;
          description: string | null;
          doors_offset_minutes: number | null;
          venue_id: string | null;
          cover_media_id: string | null;
          page_id: string | null;
          refunds_open: boolean | null;
          refund_policy_key: string | null;
          refunds_close_at: string | null;
        }>(
          "event",
          admin
            .from("events")
            .select("id, title, slug, status, description, doors_offset_minutes, venue_id, cover_media_id, page_id, refunds_open, refund_policy_key, refunds_close_at")
            .eq("tenant_id", T)
            .eq("id", out.eventId)
            .maybeSingle(),
        )
      : Promise.resolve(null),
  ]);

  out.orderStatus = order?.status ?? null;
  out.receiptCode = order?.receipt_code ?? null;
  out.refundRequested = intents.length > 0;

  const lineIds = siblingLines.map((l) => l.id);
  if (lineIds.length > 0) {
    const sibs = await many<{ id: string; line_seq: number | null }>(
      "siblings",
      admin.from("admissions").select("id, line_seq").eq("tenant_id", T).in("order_line_id", lineIds),
    );
    out.siblings = sibs.map((s) => ({ id: s.id, lineSeq: s.line_seq === null || s.line_seq === undefined ? null : Number(s.line_seq) }));
  }

  const venueId = event?.venue_id ?? session?.venue_id ?? null;
  const [venue, cover, page] = await Promise.all([
    venueId
      ? one<{ name: string | null; city: string | null; timezone: string | null }>("venue", admin.from("venues").select("name, city, timezone").eq("tenant_id", T).eq("id", venueId).maybeSingle())
      : Promise.resolve(null),
    event?.cover_media_id
      ? one<{ public_url: string | null }>("cover", admin.from("media_assets").select("public_url").eq("id", event.cover_media_id).maybeSingle())
      : Promise.resolve(null),
    event?.page_id
      ? one<{ slug: string | null; status: string | null }>("page", admin.from("cms_pages").select("slug, status").eq("id", event.page_id).maybeSingle())
      : Promise.resolve(null),
  ]);

  if (event) {
    out.eventTitle = event.title ?? null;
    out.eventSlug = event.slug ?? null;
    out.eventStatus = event.status ?? null;
    out.eventDescription = event.description ?? null;
    out.doorsOffsetMinutes = Math.max(0, Number(event.doors_offset_minutes ?? 0));
  }
  out.coverUrl = cover?.public_url ?? null;
  out.pageSlug = page && page.status === "published" && page.slug ? page.slug : null;
  out.refundsOpen = event?.refunds_open === true;
  out.refundPolicyKey = event?.refund_policy_key ?? null;
  out.refundsCloseAt = event?.refunds_close_at ?? null;
  out.venueName = venue?.name ?? null;
  out.venueCity = venue?.city ?? null;
  out.timeZone = resolvePublicZone({ venue: venue?.timezone ?? null, workspace: workspace?.timezone ?? null });
  return out;
}
