import * as React from "react";
import { SupportMail } from "./_shared";
import type { EmailBrand } from "../components/Layout";

interface Props {
  ticketNumber: number;
  subject: string;
  note?: string;
  replyUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function TicketFixed({
  ticketNumber,
  subject,
  note,
  replyUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const intro = note
    ? `The issue you reported on "${subject || "your ticket"}" (Tulala #${ticketNumber}) is fixed. ${note}`
    : `The issue you reported on "${subject || "your ticket"}" (Tulala #${ticketNumber}) is fixed.`;
  return (
    <SupportMail
      preview={`The issue you reported is fixed (Tulala #${ticketNumber})`}
      heading="The issue you reported is fixed"
      intro={intro}
      ctaUrl={replyUrl}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

TicketFixed.PreviewProps = {
  ticketNumber: 1842,
  subject: "Slow roster photo uploads",
  note: "Shipped in today's update.",
  replyUrl: "https://tulala.digital/admin?support=preview",
  categoryLabel: "messages",
} satisfies Props;
