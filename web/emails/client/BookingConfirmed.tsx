import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  clientName: string | null;
  contactName: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  bookingUrl: string;
  brand?: EmailBrand;
}

export default function BookingConfirmed({
  clientName,
  contactName,
  eventDate,
  eventLocation,
  bookingUrl,
  brand,
}: Props) {
  const name = clientName ?? "there";
  const event = contactName ?? "your booking";

  const fields = [
    eventDate ? { label: "Date", value: eventDate } : null,
    eventLocation ? { label: "Location", value: eventLocation } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout preview="Booking confirmed" brand={brand}>
      <Heading style={h2}>Booking confirmed</Heading>
      <Text style={body}>
        Hi {name}, {event} has been confirmed.
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>
        The agency will be in touch with next steps. You can view your booking from your dashboard.
      </Text>
      <Button href={bookingUrl}>View booking →</Button>
    </Layout>
  );
}

BookingConfirmed.PreviewProps = {
  clientName: "Marco Bianchi",
  contactName: "Sofia's Wedding",
  eventDate: "14 Jun 2026",
  eventLocation: "Lake Como, Italy",
  bookingUrl: "https://tulala.digital/client/bookings/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
