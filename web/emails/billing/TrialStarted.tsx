import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  recipientName: string | null;
  planLabel: string | null;
  /** Pre-formatted trial-end date, e.g. "21 June 2026". */
  trialEndsAt: string | null;
  billingUrl: string;
  brand?: EmailBrand;
}

export default function TrialStarted({
  recipientName,
  planLabel,
  trialEndsAt,
  billingUrl,
  brand,
}: Props) {
  const name = recipientName ?? "there";
  const plan = planLabel ?? "your plan";

  const fields = [
    { label: "Plan", value: plan },
    ...(trialEndsAt ? [{ label: "Trial ends", value: trialEndsAt }] : []),
  ];

  return (
    <Layout preview="Your trial is active" brand={brand}>
      <Heading style={h2}>Your trial is active</Heading>
      <Text style={body}>
        Hi {name}, your {plan} trial is live — explore everything it unlocks. You won&apos;t be
        charged{trialEndsAt ? ` until ${trialEndsAt}` : " during the trial"}, and you can manage
        your subscription anytime.
      </Text>
      <FieldTable fields={fields} />
      <Button href={billingUrl}>Manage subscription →</Button>
    </Layout>
  );
}

TrialStarted.PreviewProps = {
  recipientName: "Sofía Herrera",
  planLabel: "Pro",
  trialEndsAt: "21 June 2026",
  billingUrl: "https://tulala.digital/talent/settings",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
