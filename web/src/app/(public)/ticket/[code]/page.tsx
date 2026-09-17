import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { encodeQr } from "@/lib/links/qr";
import { toSvg } from "@/lib/links/qr/render";
import { resolveTenantTimezone } from "@/lib/spaces/venues";
import { orderRef, tierWord, venueClock } from "@/lib/pos/door-model";
import { logServerError } from "@/lib/server/safe-error";
import { loadTicketByCode } from "@/lib/venues/ticket-self";
import { resolveVenueEngineRefusals } from "@/lib/venues/engine-refusals";

import { TicketSelfClient, type TicketFacts } from "./ticket-client";

export const dynamic = "force-dynamic";

/**
 * The facts the E08 board prints under the QR: the event, the night on the
 * venue's clock, the venue, the tier and the order. Every read is scoped to
 * the host's tenant; a read that fails logs and leaves its line blank rather
 * than failing the page, because the QR above is the ticket and it is
 * already signed.
 */
async function ticketFacts(
  admin: SupabaseClient,
  tenantId: string,
  ticket: { admissionId: string; sessionId: string | null; startsAt: string | null },
  locale: string,
): Promise<TicketFacts> {
  const facts: TicketFacts = { eventTitle: null, eventSlug: null, nightLabel: null, doorsLabel: null, venueName: null, tierLabel: null, orderCode: null, orderCount: null };
  try {
    let eventId: string | null = null;
    let venueId: string | null = null;
    let doorsOffset = 0;
    // The night: the admission's own stamp, else the session's (a ticket
    // minted at the box office carries the session and not the stamp).
    let startsAt = ticket.startsAt;
    if (ticket.sessionId) {
      const { data: s } = await admin.from("sessions").select("event_id, venue_id, starts_at").eq("tenant_id", tenantId).eq("id", ticket.sessionId).maybeSingle();
      const sess = s as { event_id: string | null; venue_id: string | null; starts_at: string | null } | null;
      eventId = sess?.event_id ?? null;
      venueId = sess?.venue_id ?? null;
      startsAt = startsAt ?? sess?.starts_at ?? null;
    }
    if (eventId) {
      const { data: e } = await admin.from("events").select("title, slug, venue_id, doors_offset_minutes").eq("tenant_id", tenantId).eq("id", eventId).maybeSingle();
      const ev = e as { title: string | null; slug: string | null; venue_id: string | null; doors_offset_minutes: number | null } | null;
      facts.eventTitle = ev?.title ?? null;
      facts.eventSlug = ev?.slug ?? null;
      venueId = venueId ?? ev?.venue_id ?? null;
      doorsOffset = Number(ev?.doors_offset_minutes) || 0;
    }
    if (venueId) {
      const { data: v } = await admin.from("venues").select("name").eq("id", venueId).eq("tenant_id", tenantId).maybeSingle();
      facts.venueName = (v as { name: string | null } | null)?.name ?? null;
    }
    // The venue's zone, else the workspace's (the same rung the door's clock
    // uses); the platform's own fallback is not a zone a guest may be shown a
    // date in, so that rung prints no date.
    const tz = await resolveTenantTimezone(tenantId, venueId);
    const publicZone = tz.source === "platform" ? null : tz.timezone;
    if (startsAt && publicZone) {
      const clock = venueClock(startsAt, publicZone, locale);
      facts.nightLabel = clock?.date ?? null;
      const doorsAt = new Date(new Date(startsAt).getTime() - doorsOffset * 60_000).toISOString();
      facts.doorsLabel = venueClock(doorsAt, publicZone, locale)?.time ?? null;
    }
    const { data: a } = await admin.from("admissions").select("order_line_id").eq("tenant_id", tenantId).eq("id", ticket.admissionId).maybeSingle();
    const lineId = (a as { order_line_id: string | null } | null)?.order_line_id ?? null;
    if (lineId) {
      const { data: l } = await admin.from("order_lines").select("order_id, label").eq("tenant_id", tenantId).eq("id", lineId).maybeSingle();
      const line = l as { order_id: string; label: string | null } | null;
      facts.tierLabel = tierWord(line?.label, facts.eventTitle) || null;
      if (line?.order_id) {
        facts.orderCode = orderRef(line.order_id);
        const { data: lines } = await admin.from("order_lines").select("id").eq("tenant_id", tenantId).eq("order_id", line.order_id);
        const ids = ((lines ?? []) as Array<{ id: string }>).map((r) => r.id);
        if (ids.length > 0) {
          const { count } = await admin.from("admissions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("order_line_id", ids);
          facts.orderCount = count ?? null;
        }
      }
    }
  } catch (err) {
    logServerError(`ticket.facts admission=${ticket.admissionId}`, err);
  }
  return facts;
}

export default async function TicketSelfPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const host = await getPublicHostContext();
  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const decoded = decodeURIComponent(code);
  const ticket = await loadTicketByCode(admin, { tenantId: host.tenantId, code: decoded });
  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  if (!ticket.ok) notFound();

  // The same QR the e-mail carries, so the phone that opened the link can be
  // scanned without finding the mail. Per the receipt page: an overflow is a
  // bug about the TOKEN, logged, and the typed code below stays the fallback.
  let qrSvg: string | null = null;
  try {
    qrSvg = toSvg(encodeQr(ticket.code, { ecc: "Q" }).matrix);
  } catch (err) {
    logServerError(`ticket.qr/overflow admission=${ticket.admissionId}`, err);
  }

  const facts = await ticketFacts(admin, host.tenantId, ticket, locale);

  return (
    <TicketSelfClient
      code={ticket.code}
      qrSvg={qrSvg}
      holderName={ticket.holderName}
      status={ticket.status}
      facts={facts}
      copy={{
        title: tr("dashboard.visit.ticket.title"),
        night: tr("dashboard.visit.ticket.night"),
        show: tr("dashboard.visit.ticket.show"),
        showDoor: tr("dashboard.visit.ticket.showDoor"),
        valid: tr("dashboard.visit.ticket.valid"),
        used: tr("dashboard.visit.ticket.used"),
        notValid: tr("dashboard.visit.ticket.notValid"),
        name: tr("dashboard.visit.ticket.name"),
        when: tr("dashboard.visit.ticket.when"),
        where: tr("dashboard.visit.ticket.where"),
        order: tr("dashboard.visit.ticket.order"),
        orderTickets: tr("dashboard.visit.ticket.orderTickets"),
        orderTicketOne: tr("dashboard.visit.ticket.orderTicketOne"),
        wallet: tr("dashboard.visit.ticket.wallet"),
        walletReason: tr("dashboard.visit.ticket.walletReason"),
        transferNote: tr("dashboard.visit.ticket.transferNote"),
        unnamed: tr("dashboard.visit.ticket.unnamed"),
        doors: tr("dashboard.visit.ticket.doors"),
        codeLabel: tr("dashboard.visit.ticket.code"),
        transfer: tr("dashboard.visit.ticket.transfer"),
        toName: tr("dashboard.visit.ticket.toName"),
        toEmail: tr("dashboard.visit.ticket.toEmail"),
        transferAction: tr("dashboard.visit.ticket.transferAction"),
        resend: tr("dashboard.visit.ticket.resend"),
        resendDone: tr("dashboard.visit.ticket.resendDone"),
        lookup: tr("dashboard.visit.ticket.lookup"),
        lookupEmail: tr("dashboard.visit.ticket.lookupEmail"),
        last4: tr("dashboard.visit.ticket.last4"),
        lookupAction: tr("dashboard.visit.ticket.lookupAction"),
        found: tr("dashboard.visit.ticket.found"),
      }}
      refusals={resolveVenueEngineRefusals(tr)}
    />
  );
}
