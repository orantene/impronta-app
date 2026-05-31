import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  contactName: string | null;
  agencyName: string;
  eventDate: string | null;
  eventLocation: string | null;
  inquiryUrl: string;
  brand?: EmailBrand;
}

export default function NewInquiryAlert({
  contactName,
  agencyName,
  eventDate,
  eventLocation,
  inquiryUrl,
  brand,
}: Props) {
  const event = contactName ?? "a new inquiry";

  const fields = [
    eventDate ? { label: "Date", value: eventDate } : null,
    eventLocation ? { label: "Location", value: eventLocation } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout preview="New inquiry received" brand={brand}>
      <Heading style={h2}>New inquiry received</Heading>
      <Text style={body}>
        A new inquiry — {event} — just came in for {agencyName}.
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>Review it and assign a coordinator.</Text>
      <Button href={inquiryUrl}>Open inquiry →</Button>
    </Layout>
  );
}

NewInquiryAlert.PreviewProps = {
  contactName: "Sofia's Wedding",
  agencyName: "Impronta Models",
  eventDate: "14 Jun 2026",
  eventLocation: "Lake Como, Italy",
  inquiryUrl: "https://tulala.digital/admin/work/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
