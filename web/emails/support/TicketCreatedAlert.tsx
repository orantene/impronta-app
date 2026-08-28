import * as React from "react";
import { SupportMail } from "./_shared";
import type { EmailBrand } from "../components/Layout";

interface Props {
  ticketNumber: number;
  subject: string;
  requesterLabel: string;
  adminUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function TicketCreatedAlert({
  ticketNumber,
  subject,
  requesterLabel,
  adminUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <SupportMail
      preview={`New support ticket #${ticketNumber}`}
      heading={`New ticket #${ticketNumber}`}
      intro={`${requesterLabel} opened "${subject || "a support request"}".`}
      ctaUrl={adminUrl}
      ctaLabel="Open in HQ"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

TicketCreatedAlert.PreviewProps = {
  ticketNumber: 142,
  subject: "Cannot publish a page",
  requesterLabel: "Giulia at Impronta",
  adminUrl: "https://tulala.digital/platform/admin/support?ticket=preview",
  categoryLabel: "platform alerts",
} satisfies Props;
