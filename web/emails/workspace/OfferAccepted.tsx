import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  recipientName: string | null;
  contactName: string | null;
  totalAmount: string;
  inquiryUrl: string;
  brand?: EmailBrand;
}

export default function OfferAccepted({
  recipientName,
  contactName,
  totalAmount,
  inquiryUrl,
  brand,
}: Props) {
  const event = contactName ?? "the inquiry";

  const fields = [{ label: "Total", value: totalAmount }];

  return (
    <Layout preview="Offer accepted" brand={brand}>
      <Heading style={h2}>Offer accepted</Heading>
      <Text style={body}>
        Good news — the client accepted the offer for {event}.
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>Confirm the booking and coordinate next steps.</Text>
      <Button href={inquiryUrl}>Open inquiry →</Button>
    </Layout>
  );
}

OfferAccepted.PreviewProps = {
  recipientName: "Giulia Conti",
  contactName: "Sofia's Wedding",
  totalAmount: "EUR 4,500.00",
  inquiryUrl: "https://tulala.digital/admin/work/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
