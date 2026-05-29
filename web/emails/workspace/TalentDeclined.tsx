import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

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
  const name = recipientName ?? "there";
  const talent = talentName ?? "A talent";
  const event = contactName ?? "an inquiry";

  return (
    <Layout
      preview="A talent declined an inquiry"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>A talent declined</Heading>
      <Text style={body}>
        Hi {name}, {talent} declined the invite for {event}. You may want to line up
        an alternative or follow up with them.
      </Text>
      <Text style={note}>Open the inquiry to review the roster.</Text>
      <Button href={inquiryUrl}>Open inquiry →</Button>
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
