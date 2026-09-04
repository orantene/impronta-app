import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Layout, type EmailBrand } from "../components/Layout";

/**
 * The confirmation a diner gets after booking a table.
 *
 * WHY THIS IS NOT `BookingConfirmed`. That template is shaped for a job: a
 * client, an event date, a location, and a button to a booking page in an
 * account. A table reservation has no account, no job and no page yet, and
 * squeezing its content into fields that mean other things is how a template
 * ends up lying — an `eventLocation` holding a cancellation deadline is worse
 * than a second component.
 *
 * THE COPY IS NOT IN HERE. `buildConfirmation` in lib/reservations/confirmation.ts
 * produces the heading and the lines, in the venue's clock and in en or es, and
 * it is tested. This renders what it returns. The email and the receipt page
 * must call the same function or a guest is told two different cancellation
 * deadlines by two surfaces that both look official.
 */
interface Props {
  heading: string;
  lines: string[];
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function TableReserved({
  heading,
  lines,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <Layout
      preview={lines[0] ?? heading}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{heading}</Heading>
      {lines.map((line, i) => (
        <Text key={i} style={i === 0 ? lead : body}>
          {line}
        </Text>
      ))}
    </Layout>
  );
}

TableReserved.PreviewProps = {
  heading: "You are booked, Ana.",
  lines: [
    "A table for 4 at Casa Rizo.",
    "Saturday 5 September at 20:00.",
    "Calle 8 Sur, Tulum",
    "We hold the table for 15 minutes.",
    "Nothing was charged. We hold your card only in case you do not arrive and do not cancel in time.",
    "Free to cancel until Saturday 5 September at 18:00.",
  ],
} satisfies Props;

const h2: React.CSSProperties = {
  fontSize: "20px",
  lineHeight: "28px",
  fontWeight: 600,
  margin: "0 0 12px",
};

const lead: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 6px",
};

const body: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 6px",
};
