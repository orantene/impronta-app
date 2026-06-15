import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  clientName: string | null;
  contactName: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  bookingUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function BookingConfirmed({
  clientName,
  contactName,
  eventDate,
  eventLocation,
  bookingUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["client.booking_confirmed"];
  const name = clientName ?? "there";
  const event = contactName ?? "your booking";

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
      <Text style={body}>{interpolate(t.intro, { name, event })}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button href={bookingUrl}>{t.button}</Button>
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
