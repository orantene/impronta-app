import * as React from "react";
import { SupportMail } from "./_shared";
import type { EmailBrand } from "../components/Layout";

interface Props {
  requestNumber: number;
  title: string;
  body: string;
  requesterLabel: string;
  phone?: string | null;
  adminUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function FeatureRequestAlert({
  requestNumber,
  title,
  body,
  requesterLabel,
  phone,
  adminUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <SupportMail
      preview={`New idea #${requestNumber}: ${title}`}
      heading={`New idea #${requestNumber}`}
      intro={`${requesterLabel} asked for "${title}".${body ? ` ${body}` : ""}`}
      footnote={phone ? `Call back: ${phone}` : undefined}
      ctaUrl={adminUrl}
      ctaLabel="Open in HQ"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

FeatureRequestAlert.PreviewProps = {
  requestNumber: 12,
  title: "Bulk edit rates across the roster",
  body: "Updating each talent one by one takes an hour every season.",
  requesterLabel: "Giulia at Impronta",
  phone: "+34 612 40 77 21",
  adminUrl: "https://tulala.digital/platform/admin/support?view=ideas",
  categoryLabel: "platform alerts",
} satisfies Props;
