import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  recipientName: string | null;
  contactName: string | null;
  inquiryUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function OfferDeclined({
  recipientName,
  contactName,
  inquiryUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const event = contactName ?? "the inquiry";

  return (
    <Layout
      preview="Offer declined"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>Offer declined</Heading>
      <Text style={body}>The client declined the offer for {event}.</Text>
      <Text style={note}>You can revise the offer or follow up with the client.</Text>
      <Button href={inquiryUrl}>Open inquiry →</Button>
    </Layout>
  );
}

OfferDeclined.PreviewProps = {
  recipientName: "Giulia Conti",
  contactName: "Sofia's Wedding",
  inquiryUrl: "https://tulala.digital/admin/work/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
