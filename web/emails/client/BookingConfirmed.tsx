import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy } from "@/lib/notifications/email-copy";
import { bookingGreeting } from "@/lib/notifications/booking-confirmed-email";

interface Props {
  clientName: string | null;
  contactName: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  /** TUL-852: the service booked and its price in the booking currency. */
  serviceName?: string | null;
  priceLabel?: string | null;
  /** G1: how long it lasts, the zone the time is written in, and the cancellation promise. */
  durationLabel?: string | null;
  timeZoneLabel?: string | null;
  policyLabel?: string | null;
  /** True when the .ics calendar file is attached to this email. */
  hasCalendarFile?: boolean;
  bookingUrl: string;
  /** The business the client booked with; shown under the brand mark. */
  sellerName?: string | null;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function BookingConfirmed({
  clientName,
  contactName,
  eventDate,
  eventLocation,
  serviceName,
  priceLabel,
  durationLabel,
  timeZoneLabel,
  policyLabel,
  hasCalendarFile,
  bookingUrl,
  sellerName,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["client.booking_confirmed"];
  const greeting = bookingGreeting(t, clientName ?? contactName);

  const fields = [
    serviceName ? { label: t.serviceLabel, value: serviceName } : null,
    eventDate ? { label: t.dateLabel, value: timeZoneLabel ? `${eventDate} (${timeZoneLabel})` : eventDate } : null,
    durationLabel ? { label: t.durationLabel, value: durationLabel } : null,
    priceLabel ? { label: t.priceLabel, value: priceLabel } : null,
    eventLocation ? { label: t.locationLabel, value: eventLocation } : null,
    policyLabel ? { label: t.policyLabel, value: policyLabel } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
      sellerName={sellerName}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{`${greeting} ${t.intro}`}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      {hasCalendarFile && <Text style={note}>{t.calendarNote}</Text>}
      <Button brand={brand} href={bookingUrl}>{t.button}</Button>
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
