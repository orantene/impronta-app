import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy } from "@/lib/notifications/email-copy";
import { bookingGreeting } from "@/lib/notifications/booking-confirmed-email";

interface Props {
  audience: "client" | "talent";
  recipientName: string | null;
  serviceName?: string | null;
  eventDate?: string | null;
  /** Stored amounts, already formatted. The talent notice never gets these. */
  depositPaid?: string | null;
  balanceDue?: string | null;
  url: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

/** A deposit reserves a booking; it is not "Booking confirmed" (TUL-1268). */
export default function BookingReserved({
  audience,
  recipientName,
  serviceName,
  eventDate,
  depositPaid,
  balanceDue,
  url,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)[`${audience}.booking_reserved`];
  const greeting = bookingGreeting(t, recipientName);
  const fields = [
    serviceName ? { label: t.fieldService, value: serviceName } : null,
    eventDate ? { label: t.fieldDate, value: eventDate } : null,
    depositPaid ? { label: t.fieldDeposit, value: depositPaid } : null,
    balanceDue ? { label: t.fieldBalance, value: balanceDue } : null,
    balanceDue && eventDate ? { label: t.fieldDueBy, value: eventDate } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  return (
    <Layout preview={t.preview} brand={brand} unsubscribeUrl={unsubscribeUrl} categoryLabel={categoryLabel}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{`${greeting} ${t.intro}`}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button brand={brand} href={url}>{t.button}</Button>
    </Layout>
  );
}

BookingReserved.PreviewProps = {
  audience: "client",
  recipientName: "Marco Bianchi",
  serviceName: "Haircut",
  eventDate: "14 Jun 2026",
  depositPaid: "$300",
  balanceDue: "$700",
  url: "https://tulala.digital/client/bookings/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
