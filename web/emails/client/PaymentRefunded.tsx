import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  clientName: string | null;
  heading: string;
  message: string;
  /** Present for a partial refund; omitted for a full reversal / closed dispute. */
  amount: string | null;
  bookingUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function PaymentRefunded({
  clientName,
  heading,
  message,
  amount,
  bookingUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = clientName ?? "there";
  return (
    <Layout
      preview={heading}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{heading}</Heading>
      <Text style={body}>
        Hi {name}, {message}
      </Text>
      {amount && <FieldTable fields={[{ label: "Refunded", value: amount }]} />}
      <Button href={bookingUrl}>View booking →</Button>
    </Layout>
  );
}

PaymentRefunded.PreviewProps = {
  clientName: "Marco Bianchi",
  heading: "Payment refunded",
  message: "your booking payment was refunded to your original payment method.",
  amount: "EUR 1,200.00",
  bookingUrl: "https://tulala.digital/client/bookings",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
