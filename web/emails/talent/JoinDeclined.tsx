import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  talentName: string | null;
  workspaceName: string | null;
  exploreUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function JoinDeclined({
  talentName,
  workspaceName,
  exploreUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = talentName ?? "there";
  const team = workspaceName ?? "this workspace";

  return (
    <Layout
      preview="Update on your roster request"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>Update on your request</Heading>
      <Text style={body}>
        Hi {name}, {team} isn&apos;t able to add you to their roster right now.
        Your Tulala profile stays live — you can keep it polished and explore
        other workspaces open for registration.
      </Text>
      <Button href={exploreUrl}>Explore workspaces →</Button>
    </Layout>
  );
}

JoinDeclined.PreviewProps = {
  talentName: "Tina Rossi",
  workspaceName: "Impronta Models",
  exploreUrl: "https://app.tulala.digital/talent/discover-agencies",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
