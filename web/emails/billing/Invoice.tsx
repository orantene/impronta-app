import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  agencyName: string;
  invoiceNumber: string;
  amount: string;
  /** Issued / event date label. */
  dateLabel: string;
  invoiceUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function Invoice({
  agencyName,
  invoiceNumber,
  amount,
  dateLabel,
  invoiceUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["payment.invoice_issued.client"];
  const fields = [
    { label: t.invoiceRowLabel, value: invoiceNumber },
    { label: t.amountRowLabel, value: amount },
    { label: t.dateRowLabel, value: dateLabel },
  ];

  return (
    <Layout preview={t.preview} brand={brand} unsubscribeUrl={unsubscribeUrl} categoryLabel={categoryLabel}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { brand: agencyName })}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button href={invoiceUrl}>{t.button}</Button>
    </Layout>
  );
}

Invoice.PreviewProps = {
  agencyName: "Impronta Models",
  invoiceNumber: "INV-2026-3F4A1B2C",
  amount: "EUR 1,250.00",
  dateLabel: "5 Jun 2026",
  invoiceUrl: "https://tulala.digital/client/bookings",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
