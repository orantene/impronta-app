import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

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
  const t = getEmailCopy(brand?.locale)["roster.join_approved"];
  const name = talentName ?? t.fallbackName;
  const team = workspaceName ?? t.fallbackTeam;

  return (
    <Layout
      preview={interpolate(t.preview, { team })}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, team })}</Text>
      <Button href={dashboardUrl}>{t.button}</Button>
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
