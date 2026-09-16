import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { encodeQr } from "@/lib/links/qr";
import { toSvg } from "@/lib/links/qr/render";
import { logServerError } from "@/lib/server/safe-error";
import { loadTicketByCode } from "@/lib/venues/ticket-self";
import { resolveVenueEngineRefusals } from "@/lib/venues/engine-refusals";

import { TicketSelfClient } from "./ticket-client";

export const dynamic = "force-dynamic";

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

  return (
    <TicketSelfClient
      code={ticket.code}
      qrSvg={qrSvg}
      holderName={ticket.holderName}
      startsAt={ticket.startsAt}
      copy={{
        title: tr("dashboard.visit.ticket.title"),
        night: tr("dashboard.visit.ticket.night"),
        show: tr("dashboard.visit.ticket.show"),
        transfer: tr("dashboard.visit.ticket.transfer"),
        toName: tr("dashboard.visit.ticket.toName"),
        toEmail: tr("dashboard.visit.ticket.toEmail"),
        transferAction: tr("dashboard.visit.ticket.transferAction"),
        resend: tr("dashboard.visit.ticket.resend"),
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
