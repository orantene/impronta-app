import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicHostContext } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadTicketByCode } from "@/lib/venues/ticket-self";

export const dynamic = "force-dynamic";

const COPY = {
  en: { title: "Your ticket", night: "Night", show: "Show this code at the door." },
  es: { title: "Tu entrada", night: "Noche", show: "Muestra este codigo en la puerta." },
  fr: { title: "Votre billet", night: "Soiree", show: "Montrez ce code a l entree." },
} as const;

export default async function TicketSelfPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const host = await getPublicHostContext();
  if ((host.kind !== "agency" && host.kind !== "hub") || !host.tenantId) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const ticket = await loadTicketByCode(admin, { tenantId: host.tenantId, code: decodeURIComponent(code) });
  if (!ticket.ok) notFound();
  const locale = await getRequestLocale();
  const copy = COPY[locale === "es" || locale === "fr" ? locale : "en"];
  return (
    <main>
      <h1>{copy.title}</h1>
      <p>{ticket.holderName}</p>
      <p>
        {copy.night}: {ticket.startsAt ?? ""}
      </p>
      <p>{copy.show}</p>
      <code>{ticket.code}</code>
    </main>
  );
}
