import * as React from "react";
import { SupportMail } from "./_shared";
import type { EmailBrand } from "../components/Layout";

interface Props {
  ticketNumber: number;
  subject: string;
  requesterLabel: string;
  phone?: string | null;
  adminUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function TicketEscalatedAlert({
  ticketNumber,
  subject,
  requesterLabel,
  phone,
  adminUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const phoneBit = phone ? ` Phone: ${phone}.` : "";
  return (
    <SupportMail
      preview={`Urgent: ticket #${ticketNumber} needs you`}
      heading={`Ticket #${ticketNumber} needs you`}
      intro={`${requesterLabel} asked for a human on "${subject || "a support request"}".${phoneBit}`}
      ctaUrl={adminUrl}
      ctaLabel="Open in HQ"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

TicketEscalatedAlert.PreviewProps = {
  ticketNumber: 142,
  subject: "Cannot publish a page",
  requesterLabel: "Giulia at Impronta",
  phone: "+52 55 1234 5678",
  adminUrl: "https://tulala.digital/platform/admin/support?ticket=preview",
  categoryLabel: "platform alerts",
} satisfies Props;
