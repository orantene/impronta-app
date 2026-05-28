import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  recipientName: string | null;
  contactName: string | null;
  eventDate: string | null;
  inquiryUrl: string;
  brand?: EmailBrand;
}

export default function BookingCanceled({
  recipientName,
  contactName,
  eventDate,
  inquiryUrl,
  brand,
}: Props) {
  const event = contactName ?? "the booking";

  const fields = [
    eventDate ? { label: "Date", value: eventDate } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout preview="Booking canceled" brand={brand}>
      <Heading style={h2}>Booking canceled</Heading>
      <Text style={body}>{event} has been canceled.</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>Check the inquiry for details and any follow-up needed.</Text>
      <Button href={inquiryUrl}>View details →</Button>
    </Layout>
  );
}

BookingCanceled.PreviewProps = {
  recipientName: "Giulia Conti",
  contactName: "Sofia's Wedding",
  eventDate: "14 Jun 2026",
  inquiryUrl: "https://tulala.digital/admin/work/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
