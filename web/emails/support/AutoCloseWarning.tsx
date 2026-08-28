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

export default function AutoCloseWarning({
  ticketNumber,
  subject,
  replyUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <SupportMail
      preview={`Still need help on #${ticketNumber}?`}
      heading="We will close this ticket soon"
      intro={`We have not heard back on "${subject || "your ticket"}" (Tulala #${ticketNumber}). Reply in the next two days if you still need help, or it will close on its own.`}
      ctaUrl={replyUrl}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

AutoCloseWarning.PreviewProps = {
  ticketNumber: 142,
  subject: "Cannot publish a page",
  replyUrl: "https://tulala.digital/admin?support=preview",
  categoryLabel: "messages",
} satisfies Props;
