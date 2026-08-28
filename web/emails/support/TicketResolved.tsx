import * as React from "react";
import { SupportMail } from "./_shared";
import type { EmailBrand } from "../components/Layout";

interface Props {
  ticketNumber: number;
  subject: string;
  replyUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function TicketResolved({
  ticketNumber,
  subject,
  replyUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <SupportMail
      preview={`Resolved: ${subject} [Tulala #${ticketNumber}]`}
      heading="Your ticket is resolved"
      intro={`"${subject || "Your ticket"}" (Tulala #${ticketNumber}) is marked resolved. Rate how it went if you have a moment.`}
      ctaUrl={replyUrl}
      ctaLabel="Rate this ticket"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

TicketResolved.PreviewProps = {
  ticketNumber: 142,
  subject: "Cannot publish a page",
  replyUrl: "https://tulala.digital/admin?support=preview",
  categoryLabel: "messages",
} satisfies Props;
