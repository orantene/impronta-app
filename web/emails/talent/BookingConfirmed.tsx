import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy } from "@/lib/notifications/email-copy";
import { bookingGreeting } from "@/lib/notifications/booking-confirmed-email";

interface Props {
  talentName: string | null;
  contactName: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  /** TUL-852: the service booked and its price (single-talent bookings only). */
  serviceName?: string | null;
  priceLabel?: string | null;
  inquiriesUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function BookingConfirmed({
  talentName,
  contactName,
  eventDate,
  eventLocation,
  serviceName,
  priceLabel,
  inquiriesUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["talent.booking_confirmed"];
  const greeting = bookingGreeting(t, talentName);

  const fields = [
    contactName ? { label: t.labelClient, value: contactName } : null,
    serviceName ? { label: t.labelService, value: serviceName } : null,
    eventDate ? { label: t.labelDate, value: eventDate } : null,
    priceLabel ? { label: t.labelPrice, value: priceLabel } : null,
    eventLocation ? { label: t.labelLocation, value: eventLocation } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{`${greeting} ${t.intro}`}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button brand={brand} href={inquiriesUrl}>{t.button}</Button>
    </Layout>
  );
}

BookingConfirmed.PreviewProps = {
  talentName: "Tina Rossi",
  contactName: "Sofia's Wedding",
  eventDate: "14 Jun 2026",
  eventLocation: "Lake Como, Italy",
  inquiriesUrl: "https://tulala.digital/talent/inquiries",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
