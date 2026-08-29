import * as React from "react";
import { SupportMail } from "./_shared";
import type { EmailBrand } from "../components/Layout";

interface Props {
  requestNumber: number;
  title: string;
  statusLabel: string;
  ownerNote?: string | null;
  replyUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function FeatureRequestUpdate({
  requestNumber,
  title,
  statusLabel,
  ownerNote,
  replyUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <SupportMail
      preview={`Your idea #${requestNumber} is now ${statusLabel}`}
      heading={`Your idea is ${statusLabel}`}
      intro={`"${title}" is now ${statusLabel}.${ownerNote ? ` ${ownerNote}` : ""}`}
      ctaUrl={replyUrl}
      ctaLabel="Open in app"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

FeatureRequestUpdate.PreviewProps = {
  requestNumber: 12,
  title: "Bulk edit rates across the roster",
  statusLabel: "planned",
  ownerNote: "Starting on this next sprint. Thank you for the idea.",
  replyUrl: "https://app.tulala.digital/impronta/admin",
  categoryLabel: "messages",
} satisfies Props;
