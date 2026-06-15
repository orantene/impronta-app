import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  agencyName: string;
  fromPlan: string;
  toPlan: string;
  effectiveLabel: string;
  billingUrl: string;
  brand?: EmailBrand;
}

export default function SubscriptionCanceled({
  agencyName,
  fromPlan,
  toPlan,
  effectiveLabel,
  billingUrl,
  brand,
}: Props) {
  const t = getEmailCopy(brand?.locale)["billing.subscription_cancelled"];
  const isFullCancel = toPlan.trim().toLowerCase() === "free";
  const preview = isFullCancel
    ? interpolate(t.previewCancel, { brand: agencyName })
    : interpolate(t.previewChange, { brand: agencyName, toPlan });

  return (
    <Layout preview={preview} brand={brand}>
      <Heading style={h2}>{isFullCancel ? t.headingCancel : t.headingChange}</Heading>
      <Text style={body}>
        {interpolate(t.intro, { brand: agencyName, fromPlan, toPlan, effective: effectiveLabel })}
      </Text>
      <Text style={body}>{isFullCancel ? t.bodyCancel : t.bodyChange}</Text>
      <Button href={billingUrl}>{t.button}</Button>
    </Layout>
  );
}

SubscriptionCanceled.PreviewProps = {
  agencyName: "Impronta Models",
  fromPlan: "Agency",
  toPlan: "free",
  effectiveLabel: "1 Jun 2026",
  billingUrl: "https://tulala.digital/admin/settings/billing",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
