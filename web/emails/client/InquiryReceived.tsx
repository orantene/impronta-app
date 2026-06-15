import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  contactName: string | null;
  agencyName: string;
  eventDate: string | null;
  eventLocation: string | null;
  inquiryUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function InquiryReceived({
  contactName,
  agencyName,
  eventDate,
  eventLocation,
  inquiryUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = contactName ?? "there";
  const t = getEmailCopy(brand?.locale)["client.inquiry_received"];

  const fields = [
    eventDate ? { label: t.dateLabel, value: eventDate } : null,
    eventLocation ? { label: t.locationLabel, value: eventLocation } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, brand: agencyName })}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button href={inquiryUrl}>{t.button}</Button>
    </Layout>
  );
}

InquiryReceived.PreviewProps = {
  contactName: "Marco Bianchi",
  agencyName: "Impronta Models",
  eventDate: "14 Jun 2026",
  eventLocation: "Lake Como, Italy",
  inquiryUrl: "https://tulala.digital/client/inquiries/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
