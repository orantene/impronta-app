import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  talentName: string | null;
  domain: string;
  days: 30 | 7;
  expiresLabel: string | null;
  settingsUrl: string;
  brand?: EmailBrand;
}

export default function DomainRenewal({
  talentName,
  domain,
  days,
  expiresLabel,
  settingsUrl,
  brand,
}: Props) {
  const t = getEmailCopy(brand?.locale)["talent.domain_renewal_notice"];
  const name = talentName ?? t.fallbackName;
  const introKey = days === 7 ? t.intro7 : t.intro30;

  return (
    <Layout preview={interpolate(t.preview, { domain, days: String(days) })} brand={brand}>
      <Heading style={h2}>{interpolate(t.heading, { days: String(days) })}</Heading>
      <Text style={body}>{interpolate(introKey, { name, domain, days: String(days) })}</Text>
      {expiresLabel ? (
        <Text style={note}>{interpolate(t.expires, { expiresLabel })}</Text>
      ) : null}
      <Text style={note}>{t.note}</Text>
      <Button brand={brand} href={settingsUrl}>{t.button}</Button>
    </Layout>
  );
}

DomainRenewal.PreviewProps = {
  talentName: "Marta Reyes",
  domain: "marta-reyes.com",
  days: 30,
  expiresLabel: "8 November 2026",
  settingsUrl: "https://app.tulala.digital/talent/site",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0 0 16px", fontSize: "13px", color: "#777777" };
