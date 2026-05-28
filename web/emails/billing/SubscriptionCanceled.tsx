import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

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
  const isFullCancel = toPlan === "free";
  const preview = isFullCancel
    ? `${agencyName} — subscription canceled`
    : `${agencyName} — plan changed to ${toPlan}`;

  return (
    <Layout preview={preview} brand={brand}>
      <Heading style={h2}>{isFullCancel ? "Your subscription is canceled" : "Plan change confirmed"}</Heading>
      <Text style={body}>
        {agencyName} moved from {fromPlan} to {toPlan}, effective {effectiveLabel}.
      </Text>
      <Text style={body}>
        {isFullCancel
          ? "Your roster, inquiries, and booking history stay intact. Public site pages stop publishing and any custom domain disconnects. Resubscribe any time at tulala.digital."
          : "Entitlements for your new tier are active immediately. Anything that requires the higher tier (custom domain, advanced analytics) is paused; everything else continues."}
      </Text>
      <Button href={billingUrl}>Manage billing →</Button>
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
