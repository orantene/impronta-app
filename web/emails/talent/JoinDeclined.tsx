import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

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
  const t = getEmailCopy(brand?.locale)["roster.join_rejected"];
  const name = talentName ?? t.fallbackName;
  const team = workspaceName ?? t.fallbackTeam;

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, team })}</Text>
      <Button href={exploreUrl}>{t.button}</Button>
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
