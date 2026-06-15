import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  recipientName: string | null;
  talentName: string | null;
  contactName: string | null;
  inquiryUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function TalentDeclined({
  recipientName,
  talentName,
  contactName,
  inquiryUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["workspace.talent_declined"];
  const isEs = (brand?.locale ?? "").toLowerCase().startsWith("es");
  const name = recipientName ?? (isEs ? "hola" : "there");
  const talent = talentName ?? (isEs ? "Un talento" : "A talent");
  const event = contactName ?? (isEs ? "una solicitud" : "an inquiry");

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, talent, event })}</Text>
      <Text style={note}>{t.note}</Text>
      <Button href={inquiryUrl}>{t.button}</Button>
    </Layout>
  );
}

TalentDeclined.PreviewProps = {
  recipientName: "Giulia Conti",
  talentName: "Marco Rossi",
  contactName: "Sofia's Wedding",
  inquiryUrl: "https://tulala.digital/admin/work/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
