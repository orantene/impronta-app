import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  recipientName: string | null;
  contactName: string | null;
  amountReceived: string;
  inquiryUrl: string;
  brand?: EmailBrand;
}

export default function PaymentReceived({
  recipientName,
  contactName,
  amountReceived,
  inquiryUrl,
  brand,
}: Props) {
  const event = contactName ?? "a booking";

  const fields = [{ label: "Amount", value: amountReceived }];

  return (
    <Layout preview="Payment received" brand={brand}>
      <Heading style={h2}>Payment received</Heading>
      <Text style={body}>A payment for {event} has been received.</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>View the breakdown and payout status from the workspace.</Text>
      <Button href={inquiryUrl}>View payment →</Button>
    </Layout>
  );
}

PaymentReceived.PreviewProps = {
  recipientName: "Giulia Conti",
  contactName: "Sofia's Wedding",
  amountReceived: "EUR 2,250.00",
  inquiryUrl: "https://tulala.digital/admin/work/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
