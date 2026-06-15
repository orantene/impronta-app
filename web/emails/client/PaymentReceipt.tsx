import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  clientName: string | null;
  contactName: string | null;
  amountPaid: string;
  paymentDate: string;
  receiptUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function PaymentReceipt({
  clientName,
  contactName,
  amountPaid,
  paymentDate,
  receiptUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["client.payment_receipt"];
  const name = clientName ?? "there";
  const event = contactName ?? "your booking";

  const fields = [
    { label: t.amountLabel, value: amountPaid },
    { label: t.dateLabel, value: paymentDate },
  ];

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, event })}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button href={receiptUrl}>{t.button}</Button>
    </Layout>
  );
}

PaymentReceipt.PreviewProps = {
  clientName: "Marco Bianchi",
  contactName: "Sofia's Wedding",
  amountPaid: "EUR 2,250.00",
  paymentDate: "28 May 2026",
  receiptUrl: "https://tulala.digital/client/bookings/abc123?tab=payment",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
