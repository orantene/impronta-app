import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { buildPublicPathname } from "@/lib/cms/paths";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { encodeQr } from "@/lib/links/qr";
import { toSvg } from "@/lib/links/qr/render";
import { orderRef, tierWord } from "@/lib/pos/door-model";
import { logServerError } from "@/lib/server/safe-error";
import { loadTicketByCode } from "@/lib/venues/ticket-self";
import { resolveVenueEngineRefusals } from "@/lib/venues/engine-refusals";
import { resolveTenantBrand } from "@/lib/brand/resolve-tenant-brand";
import { REFUND_POLICY_DESCRIPTION_KEYS, type RefundPolicyKey } from "@/lib/billing/commercial-terms-types";
import { loadTicketPageFacts } from "@/lib/events/ticket-page-facts";
import { whenLabel } from "@/lib/events/public-event-time";
import {
  dateBadge,
  isVipTier,
  nightClocks,
  orderPosition,
  refundEligibility,
  ticketLocale,
  whatsappShareHref,
} from "@/lib/events/ticket-page-model";

import { TicketSelfClient, type TicketCopy, type TicketModel } from "./ticket-client";

export const dynamic = "force-dynamic";

const POLICY_KEYS = new Set<string>(["tiered", "flexible", "strict", "manual"]);

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

  // Every facts read acts on its error; a failed read refuses the page rather
  // than rendering a ticket with no night and no venue (c1ecc2f6b).
  const [facts, brand] = await Promise.all([
    loadTicketPageFacts(admin, { tenantId: host.tenantId, admissionId: ticket.admissionId }),
    resolveTenantBrand(host.tenantId),
  ]);
  if (!facts) notFound();

  // Dates read in the venue's zone; the WORDS follow the request locale the
  // translator already resolved (the receipt page's rule).
  const dl = ticketLocale(locale);
  const startsAt = facts.sessionStartsAt ?? ticket.startsAt;
  const clocks = nightClocks(startsAt, facts.doorsOffsetMinutes, facts.timeZone, dl);
  const venueLine = [facts.venueName ?? facts.workspaceName, facts.venueCity].filter(Boolean).join(" · ") || null;
  const eventHref = facts.eventSlug
    ? `/events/${encodeURIComponent(facts.eventSlug)}`
    : facts.pageSlug
      ? buildPublicPathname(locale, facts.pageSlug)
      : null;

  const state: TicketModel["state"] = ticket.status === "valid" ? (facts.admittedCount > 0 ? "used" : "valid") : "notValid";
  // The tier as the door prints it (the event's own name stripped) and the
  // order as the door refers to it, so a guest and a doorkeeper read the same words.
  const tierLabel = tierWord(facts.tierLabel, facts.eventTitle) || facts.eventTitle || tr("dashboard.visit.ticket.title");
  const orderCode = facts.orderId ? orderRef(facts.orderId) : null;
  const orderCount = facts.siblings.length > 0 ? facts.siblings.length : null;

  const eligibility = refundEligibility({
    refundsOpen: facts.refundsOpen,
    refundsCloseAt: facts.refundsCloseAt,
    now: new Date(),
    admissionStatus: ticket.status,
    admittedCount: facts.admittedCount,
    eventStatus: facts.eventStatus,
    lineTotalCents: facts.lineTotalCents,
    lineRefundedCents: facts.lineRefundedCents,
    alreadyRequested: facts.refundRequested,
  });
  // The section only exists when the venue opened refunds, or when the
  // holder already asked (so "request received" survives a reload). A venue
  // that never opened them gets no refund copy at all.
  const refundSectionVisible = facts.refundsOpen || facts.refundRequested;
  const refundReasons: Record<string, string> = {
    refunds_closed: tr("dashboard.visit.ticket.refundReason.refunds_closed"),
    already_used: tr("dashboard.visit.ticket.refundReason.already_used"),
    not_valid: tr("dashboard.visit.ticket.refundReason.not_valid"),
    event_cancelled: tr("dashboard.visit.ticket.refundReason.event_cancelled"),
    nothing_to_refund: tr("dashboard.visit.ticket.refundReason.nothing_to_refund"),
    already_requested: tr("dashboard.visit.ticket.refundReason.already_requested"),
  };
  const policyKey = facts.refundPolicyKey && POLICY_KEYS.has(facts.refundPolicyKey) ? (facts.refundPolicyKey as RefundPolicyKey) : null;

  const model: TicketModel = {
    code: ticket.code,
    qrSvg,
    qrPngHref: `/api/tickets/${encodeURIComponent(ticket.code)}/qr`,
    holderName: ticket.holderName,
    status: ticket.status,
    state,
    eventTitle: facts.eventTitle ?? tr("dashboard.visit.ticket.title"),
    coverUrl: facts.coverUrl,
    badge: dateBadge(startsAt, facts.timeZone, dl),
    nightLabel: startsAt ? whenLabel(startsAt, facts.timeZone, dl, true) : null,
    venueLine,
    venueName: facts.venueName ?? facts.workspaceName,
    doorsClock: clocks.doors,
    showClock: clocks.show,
    tierLabel,
    partySize: facts.partySize,
    seatLabel: facts.seatLabel,
    vip: isVipTier(facts.tierLabel),
    orderCode,
    orderCount,
    position: orderPosition(ticket.admissionId, facts.siblings),
    eventHref,
    whatsappHref: whatsappShareHref(tr("dashboard.visit.ticket.shareText"), `${brand.homeHref.replace(/\/$/, "")}/ticket/${encodeURIComponent(ticket.code)}`),
    refundOpen: refundSectionVisible && eligibility.ok,
    refundClosedReason: refundSectionVisible && !eligibility.ok ? refundReasons[eligibility.reason] : null,
  };

  const copy: TicketCopy = {
    brand: brand.accountName || null,
    title: tr("dashboard.visit.ticket.title"),
    back: tr("dashboard.visit.ticket.back"),
    night: tr("dashboard.visit.ticket.night"),
    dateTba: tr("dashboard.visit.ticket.dateTba"),
    doors: tr("dashboard.visit.ticket.doors"),
    event: tr("dashboard.visit.ticket.event"),
    admits: tr("dashboard.visit.ticket.admits"),
    seat: tr("dashboard.visit.ticket.seat"),
    vip: tr("dashboard.visit.ticket.vip"),
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
    position: tr("dashboard.visit.ticket.position"),
    unnamed: tr("dashboard.visit.ticket.unnamed"),
    codeLabel: tr("dashboard.visit.ticket.code"),
    transferNote: tr("dashboard.visit.ticket.transferNote"),
    resendDone: tr("dashboard.visit.ticket.resendDone"),
    save: tr("dashboard.visit.ticket.save"),
    print: tr("dashboard.visit.ticket.print"),
    copyLink: tr("dashboard.visit.ticket.copyLink"),
    copied: tr("dashboard.visit.ticket.copied"),
    share: tr("dashboard.visit.ticket.share"),
    shareText: tr("dashboard.visit.ticket.shareText"),
    eventInfo: tr("dashboard.visit.ticket.eventInfo"),
    transfer: tr("dashboard.visit.ticket.transfer"),
    toName: tr("dashboard.visit.ticket.toName"),
    toEmail: tr("dashboard.visit.ticket.toEmail"),
    transferAction: tr("dashboard.visit.ticket.transferAction"),
    resend: tr("dashboard.visit.ticket.resend"),
    refund: tr("dashboard.visit.ticket.refund"),
    refundTitle: tr("dashboard.visit.ticket.refundTitle"),
    refundPolicy: tr("dashboard.visit.ticket.refundPolicy"),
    refundPolicyText: policyKey ? tr(REFUND_POLICY_DESCRIPTION_KEYS[policyKey]) : null,
    refundReceived: tr("dashboard.visit.ticket.refundReceived"),
    refundReceivedManual: tr("dashboard.visit.ticket.refundReceivedManual"),
    refundReasons,
    lookup: tr("dashboard.visit.ticket.lookup"),
    lookupEmail: tr("dashboard.visit.ticket.lookupEmail"),
    last4: tr("dashboard.visit.ticket.last4"),
    lookupAction: tr("dashboard.visit.ticket.lookupAction"),
    found: tr("dashboard.visit.ticket.found"),
  };

  return <TicketSelfClient m={model} copy={copy} refusals={resolveVenueEngineRefusals(tr)} />;
}
