import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

/**
 * Day-of booking reminder (spec §6.4) — a heads-up that a confirmed booking is
 * happening tomorrow. The `booking-reminders` cron (24h before `event_date`)
 * dispatches `booking.day_of_reminder` to the client + every booked talent;
 * both surfaces render this one shared template (the message is the same: "your
 * event is tomorrow"), differing only in the inquiry CTA link.
 */

interface Props {
  recipientName: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  inquiryUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function DayOfReminder({
  recipientName,
  eventDate,
  eventLocation,
  inquiryUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = recipientName ?? "there";

  const fields = [
    eventDate ? { label: "Date", value: eventDate } : null,
    eventLocation ? { label: "Location", value: eventLocation } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview="Reminder: your event is tomorrow"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>Your event is tomorrow</Heading>
      <Text style={body}>
        Hi {name}, this is a reminder that you have a booking tomorrow. Here are the details:
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>Open the inquiry for the full schedule, location, and any final notes.</Text>
      <Button href={inquiryUrl}>View details →</Button>
    </Layout>
  );
}

DayOfReminder.PreviewProps = {
  recipientName: "Giulia Conti",
  eventDate: "14 Jun 2026",
  eventLocation: "Lake Como, Italy",
  inquiryUrl: "https://tulala.digital/client/inquiries/abc123",
  categoryLabel: "booking",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
