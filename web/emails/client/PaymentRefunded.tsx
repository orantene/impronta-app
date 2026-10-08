import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  clientName: string | null;
  /** Optional override; by default the localized heading for the refund kind. */
  heading?: string;
  /** Optional override; by default the localized message for the refund kind. */
  message?: string;
  /** Dispute closed with the charge reversed (full refunds only). */
  isDispute?: boolean;
  sellerName?: string | null;
  /** Present for a partial refund; omitted for a full reversal / closed dispute. */
  amount: string | null;
  bookingUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function PaymentRefunded({
  clientName,
  heading: headingOverride,
  message: messageOverride,
  isDispute,
  sellerName,
  amount,
  bookingUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = clientName ?? "there";
  // heading + message are passed in by the catalog (reason-dependent); the
  // template owns the greeting wrapper, the field label, and the button. The
  // two refund templateIds share identical owned copy — pick by shape.
  const copy = getEmailCopy(brand?.locale);
  const full = copy["client.payment_refunded"];
  const t = amount ? copy["client.partial_refund"] : full;
  const heading = headingOverride ?? (amount ? t.heading : isDispute ? full.disputeHeading : t.heading);
  const message =
    messageOverride ??
    (amount ? interpolate(t.message, { amount }) : isDispute ? full.disputeMessage : t.message);
  return (
    <Layout
      preview={heading}
      sellerName={sellerName}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{heading}</Heading>
      <Text style={body}>{interpolate(t.greeting, { name, message })}</Text>
      {amount && <FieldTable fields={[{ label: t.refundedLabel, value: amount }]} />}
      <Button brand={brand} href={bookingUrl}>{t.button}</Button>
    </Layout>
  );
}

PaymentRefunded.PreviewProps = {
  clientName: "Marco Bianchi",
  heading: "Payment refunded",
  message: "your booking payment was refunded to your original payment method.",
  amount: "EUR 1,200.00",
  bookingUrl: "https://tulala.digital/client/bookings",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
