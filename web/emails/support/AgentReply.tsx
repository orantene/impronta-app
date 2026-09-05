import * as React from "react";
import { SupportMail } from "./_shared";
import { SUPPORT_AGENT } from "@/lib/support/support-persona";
import type { EmailBrand } from "../components/Layout";

interface Props {
  ticketNumber: number;
  subject: string;
  replyUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function AgentReply({
  ticketNumber,
  subject,
  replyUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <SupportMail
      preview={`${SUPPORT_AGENT.name} replied - ${subject} [Tulala #${ticketNumber}]`}
      heading={`${SUPPORT_AGENT.name} replied`}
      intro={`There is a new reply on "${subject || "your ticket"}" (Tulala #${ticketNumber}).`}
      ctaUrl={replyUrl}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

AgentReply.PreviewProps = {
  ticketNumber: 142,
  subject: "Cannot publish a page",
  replyUrl: "https://tulala.digital/admin?support=preview",
  categoryLabel: "messages",
} satisfies Props;
