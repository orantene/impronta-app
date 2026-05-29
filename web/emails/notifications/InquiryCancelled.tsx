import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  recipientName: string | null;
  contactName: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  inquiryUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function InquiryCancelled({
  recipientName,
  contactName,
  eventDate,
  eventLocation,
  inquiryUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = recipientName ?? "there";
  const event = contactName ?? "an inquiry";

  const fields = [
    eventDate ? { label: "Date", value: eventDate } : null,
    eventLocation ? { label: "Location", value: eventLocation } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview="An inquiry has been cancelled"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>Inquiry cancelled</Heading>
      <Text style={body}>
        Hi {name}, {event} has been cancelled. No further action is needed.
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>You can review the details any time.</Text>
      <Button href={inquiryUrl}>View details →</Button>
    </Layout>
  );
}

InquiryCancelled.PreviewProps = {
  recipientName: "Sofia Marino",
  contactName: "Sofia's Wedding",
  eventDate: "14 Jun 2026",
  eventLocation: "Lake Como, Italy",
  inquiryUrl: "https://tulala.digital/client/inquiries/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
