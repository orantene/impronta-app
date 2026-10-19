import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  recipientName: string | null;
  contactName: string | null;
  eventDate: string | null;
  inquiryUrl: string;
  /** Which voice and copy block to use. Defaults to the staff notice. */
  audience?: "client" | "talent" | "workspace";
  serviceName?: string | null;
  /** Display-only refund line (see booking-cancelled-copy). */
  refundLine?: string | null;
  /** Who cancelled (or that it expired), already in the recipient's language. */
  byLine?: string | null;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function BookingCanceled({
  recipientName,
  contactName,
  eventDate,
  inquiryUrl,
  audience = "workspace",
  serviceName,
  refundLine,
  byLine,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const copy = getEmailCopy(brand?.locale);
  const t = copy[`${audience}.booking_cancelled`];
  const isEs = (brand?.locale ?? "").toLowerCase().startsWith("es");
  const event =
    audience === "client"
      ? isEs ? "Tu reserva" : "Your booking"
      : contactName ?? (isEs ? "La reserva" : "The booking");
  const intro = serviceName
    ? interpolate(t.introService, { event, service: serviceName })
    : interpolate(t.intro, { event });

  const fields = [
    serviceName ? { label: t.fieldService, value: serviceName } : null,
    eventDate ? { label: t.fieldDate, value: eventDate } : null,
    refundLine ? { label: t.fieldRefund, value: refundLine } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{intro}</Text>
      {byLine && <Text style={body}>{byLine}</Text>}
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button brand={brand} href={inquiryUrl}>{t.button}</Button>
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
