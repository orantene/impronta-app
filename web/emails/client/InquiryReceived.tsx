import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

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

  const fields = [
    eventDate ? { label: "Date", value: eventDate } : null,
    eventLocation ? { label: "Location", value: eventLocation } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview="We've received your inquiry"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>We&apos;ve received your inquiry</Heading>
      <Text style={body}>
        Hi {name}, thanks for reaching out to {agencyName}. We&apos;ll get back to you as soon as
        possible.
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>You can track the status of your inquiry from your dashboard.</Text>
      <Button href={inquiryUrl}>View inquiry →</Button>
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
