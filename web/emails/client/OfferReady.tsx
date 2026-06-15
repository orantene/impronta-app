import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  clientName: string | null;
  contactName: string | null;
  totalAmount: string;
  offerUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function OfferReady({
  clientName,
  contactName,
  totalAmount,
  offerUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["client.offer_ready"];
  const name = clientName ?? "there";
  const event = contactName ?? "your inquiry";

  const fields = [{ label: t.totalLabel, value: totalAmount }];

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
      <Button href={offerUrl}>{t.button}</Button>
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
