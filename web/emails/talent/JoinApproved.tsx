import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  talentName: string | null;
  workspaceName: string | null;
  dashboardUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function JoinApproved({
  talentName,
  workspaceName,
  dashboardUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = talentName ?? "there";
  const team = workspaceName ?? "the roster";

  return (
    <Layout
      preview={`You're on ${team}`}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>You&apos;re on the roster</Heading>
      <Text style={body}>
        Hi {name}, your request to join {team} was approved. Open your dashboard
        to keep your photos, rates, and availability up to date.
      </Text>
      <Button href={dashboardUrl}>Go to my dashboard →</Button>
    </Layout>
  );
}

JoinApproved.PreviewProps = {
  talentName: "Tina Rossi",
  workspaceName: "Impronta Models",
  dashboardUrl: "https://app.tulala.digital/talent",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
