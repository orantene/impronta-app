import * as React from "react";
import { SupportMail } from "./_shared";
import type { EmailBrand } from "../components/Layout";

interface Props {
  ticketNumber: number;
  subject: string;
  requesterLabel: string;
  preview: string;
  adminUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function TicketReplyAlert({
  ticketNumber,
  subject,
  requesterLabel,
  preview,
  adminUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <SupportMail
      preview={`New reply on ticket #${ticketNumber}`}
      heading={`New reply on #${ticketNumber}`}
      intro={`${requesterLabel} replied on "${subject || "a support request"}"${preview ? `: ${preview}` : "."}`}
      ctaUrl={adminUrl}
      ctaLabel="Open in HQ"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

TicketReplyAlert.PreviewProps = {
  ticketNumber: 142,
  subject: "Cannot publish a page",
  requesterLabel: "Giulia at Impronta",
  preview: "Still not working after the DNS change.",
  adminUrl: "https://tulala.digital/platform/admin/support?ticket=preview",
  categoryLabel: "platform alerts",
} satisfies Props;
