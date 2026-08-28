import * as React from "react";
import { SupportMail } from "./_shared";
import type { EmailBrand } from "../components/Layout";

interface Props {
  summary: string;
  adminUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function WeeklyDigest({
  summary,
  adminUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <SupportMail
      preview="This week's support digest"
      heading="Support digest"
      intro={summary}
      ctaUrl={adminUrl}
      ctaLabel="Open Insights"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

WeeklyDigest.PreviewProps = {
  summary: "Domain connection was the top friction this week.",
  adminUrl: "https://tulala.digital/platform/admin/support?view=insights",
  categoryLabel: "platform alerts",
} satisfies Props;
