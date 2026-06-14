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

export default function TrialWillEnd({
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
    <Layout preview="Your trial is ending soon" brand={brand}>
      <Heading style={h2}>Your trial is ending soon</Heading>
      <Text style={body}>
        Hi {name}, your {plan} trial{trialEndsAt ? ` ends on ${trialEndsAt}` : " is ending soon"}.
        To keep your features without interruption, add a payment method or confirm your
        subscription.
      </Text>
      <FieldTable fields={fields} />
      <Text style={note}>You won&apos;t be charged until your trial ends.</Text>
      <Button href={billingUrl}>Manage billing →</Button>
    </Layout>
  );
}

TrialWillEnd.PreviewProps = {
  recipientName: "Sofía Herrera",
  planLabel: "Pro",
  trialEndsAt: "21 June 2026",
  billingUrl: "https://tulala.digital/talent/settings",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
