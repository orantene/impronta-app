import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  agencyName: string;
  toPlan: string;
  billingUrl: string;
  brand?: EmailBrand;
}

export default function PlanUpgraded({ agencyName, toPlan, billingUrl, brand }: Props) {
  return (
    <Layout preview={`You're on ${toPlan}`} brand={brand}>
      <Heading style={h2}>You&apos;re on {toPlan}</Heading>
      <Text style={body}>
        {agencyName} is now on the {toPlan} plan. Your new features are active immediately.
      </Text>
      <Text style={note}>Manage your plan and billing anytime.</Text>
      <Button href={billingUrl}>Manage billing →</Button>
    </Layout>
  );
}

PlanUpgraded.PreviewProps = {
  agencyName: "Impronta Models",
  toPlan: "Agency",
  billingUrl: "https://tulala.digital/admin/settings/billing",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
