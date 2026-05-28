import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  coordinatorName: string | null;
  contactName: string | null;
  agencyName: string;
  eventDate: string | null;
  inquiryUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function CoordinatorAssigned({
  coordinatorName,
  contactName,
  agencyName,
  eventDate,
  inquiryUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = coordinatorName ?? "there";
  const event = contactName ?? "a new inquiry";

  return (
    <Layout
      preview="New inquiry assigned to you"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>New inquiry assigned to you</Heading>
      <Text style={body}>
        Hi {name}, you&apos;ve been assigned as coordinator for {event} at {agencyName}.
        {eventDate ? ` The event is on ${eventDate}.` : ""}
      </Text>
      <Text style={note}>Review the inquiry and reach out to the client.</Text>
      <Button href={inquiryUrl}>Open inquiry →</Button>
    </Layout>
  );
}

CoordinatorAssigned.PreviewProps = {
  coordinatorName: "Giulia Conti",
  contactName: "Sofia's Wedding",
  agencyName: "Impronta Models",
  eventDate: "14 Jun 2026",
  inquiryUrl: "https://tulala.digital/admin/work/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
