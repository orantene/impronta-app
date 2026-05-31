import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  agencyName: string;
  invoiceNumber: string;
  amount: string;
  periodLabel: string;
  invoiceUrl: string;
  brand?: EmailBrand;
}

export default function Invoice({
  agencyName,
  invoiceNumber,
  amount,
  periodLabel,
  invoiceUrl,
  brand,
}: Props) {
  const fields = [
    { label: "Invoice", value: invoiceNumber },
    { label: "Amount", value: amount },
    { label: "Period", value: periodLabel },
  ];

  return (
    <Layout preview="Your invoice" brand={brand}>
      <Heading style={h2}>Your invoice</Heading>
      <Text style={body}>Here&apos;s your latest invoice for {agencyName}.</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>A copy is always available from your billing settings.</Text>
      <Button href={invoiceUrl}>View invoice →</Button>
    </Layout>
  );
}

Invoice.PreviewProps = {
  agencyName: "Impronta Models",
  invoiceNumber: "INV-2026-0042",
  amount: "EUR 49.00",
  periodLabel: "May 2026",
  invoiceUrl: "https://tulala.digital/admin/settings/billing",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
