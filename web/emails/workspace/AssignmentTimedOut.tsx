import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

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
  const name = recipientName ?? "there";
  const event = contactName ?? "a new inquiry";

  const fields = [eventDate ? { label: "Date", value: eventDate } : null].filter(
    Boolean,
  ) as { label: string; value: string }[];

  return (
    <Layout
      preview="An inquiry needs a coordinator"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>An inquiry needs a coordinator</Heading>
      <Text style={body}>
        Hi {name}, {event} hasn&apos;t been picked up automatically and is still
        waiting for a coordinator. Please assign someone so the client gets a timely
        reply.
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>Open the inquiry to assign a coordinator.</Text>
      <Button href={inquiryUrl}>Assign coordinator →</Button>
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
