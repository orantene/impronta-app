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
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function AssignmentTimedOut({
  recipientName,
  contactName,
  eventDate,
  inquiryUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["workspace.assignment_timed_out"];
  const isEs = (brand?.locale ?? "").toLowerCase().startsWith("es");
  const name = recipientName ?? (isEs ? "hola" : "there");
  const event = contactName ?? (isEs ? "una nueva solicitud" : "a new inquiry");

  const fields = [eventDate ? { label: t.fieldDate, value: eventDate } : null].filter(
    Boolean,
  ) as { label: string; value: string }[];

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
      <Button href={inquiryUrl}>{t.button}</Button>
    </Layout>
  );
}

AssignmentTimedOut.PreviewProps = {
  recipientName: "Giulia Conti",
  contactName: "Sofia's Wedding",
  eventDate: "14 Jun 2026",
  inquiryUrl: "https://tulala.digital/admin/work/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
