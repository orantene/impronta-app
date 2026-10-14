import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  talentName: string | null;
  domain: string;
  failureReason: string | null;
  settingsUrl: string;
  brand?: EmailBrand;
}

export default function DomainBroken({
  talentName,
  domain,
  failureReason,
  settingsUrl,
  brand,
}: Props) {
  const t = getEmailCopy(brand?.locale)["talent.domain_broken"];
  const name = talentName ?? t.fallbackName;

  return (
    <Layout preview={interpolate(t.preview, { domain })} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, domain })}</Text>
      {failureReason ? <Text style={note}>{interpolate(t.reason, { reason: failureReason })}</Text> : null}
      <Text style={note}>{t.note}</Text>
      <Button brand={brand} href={settingsUrl}>{t.button}</Button>
    </Layout>
  );
}

DomainBroken.PreviewProps = {
  talentName: "Marta Reyes",
  domain: "marta-reyes.com",
  failureReason: "DNS routing records are missing or no longer point to Tulala.",
  settingsUrl: "https://app.tulala.digital/talent/site",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0 0 16px", fontSize: "13px", color: "#777777" };
