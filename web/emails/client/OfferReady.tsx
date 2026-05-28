import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  clientName: string | null;
  contactName: string | null;
  totalAmount: string;
  offerUrl: string;
  brand?: EmailBrand;
}

export default function OfferReady({
  clientName,
  contactName,
  totalAmount,
  offerUrl,
  brand,
}: Props) {
  const name = clientName ?? "there";
  const event = contactName ?? "your inquiry";

  const fields = [{ label: "Total", value: totalAmount }];

  return (
    <Layout preview="Your offer is ready" brand={brand}>
      <Heading style={h2}>Your offer is ready</Heading>
      <Text style={body}>
        Hi {name}, the agency has prepared an offer for {event}.
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>Review the offer and accept or decline from your dashboard.</Text>
      <Button href={offerUrl}>Review offer →</Button>
    </Layout>
  );
}

OfferReady.PreviewProps = {
  clientName: "Marco Bianchi",
  contactName: "Sofia's Wedding",
  totalAmount: "EUR 4,500.00",
  offerUrl: "https://tulala.digital/client/inquiries/abc123?tab=offer",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
