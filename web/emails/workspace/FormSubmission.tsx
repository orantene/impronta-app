import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  formName: string;
  agencyName: string;
  contactName: string | null;
  contactEmail: string | null;
  /** ISO-8601 string of submission timestamp */
  submittedAt: string;
  /** URL to the operator forms inbox */
  inboxUrl: string;
  /** The form payload projected as label→value pairs (capped at 8 fields) */
  payloadFields: Array<{ label: string; value: string }>;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
}

export default function FormSubmission({
  formName,
  agencyName,
  contactName,
  contactEmail,
  submittedAt,
  inboxUrl,
  payloadFields,
  brand,
  unsubscribeUrl,
}: Props) {
  const preview = contactName
    ? `New form submission from ${contactName} — ${formName}`
    : `New form submission — ${formName}`;

  const dateLabel = (() => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(submittedAt));
    } catch {
      return submittedAt;
    }
  })();

  const metaFields: Array<{ label: string; value: string }> = [
    { label: "Form", value: formName },
    ...(contactName ? [{ label: "Name", value: contactName }] : []),
    ...(contactEmail ? [{ label: "Email", value: contactEmail }] : []),
    { label: "Received", value: dateLabel },
  ];

  return (
    <Layout preview={preview} brand={brand} unsubscribeUrl={unsubscribeUrl} categoryLabel="site">
      <Heading style={h2}>New form submission</Heading>
      <Text style={body}>
        A visitor submitted the <strong>{formName}</strong> form on your {agencyName} site.
      </Text>

      <FieldTable fields={metaFields} />

      {payloadFields.length > 0 && (
        <>
          <Text style={sectionLabel}>Submitted fields</Text>
          <FieldTable fields={payloadFields} />
        </>
      )}

      <Button href={inboxUrl}>Open inbox →</Button>

      <Text style={note}>
        Mark it as read or archive it in your forms inbox.
      </Text>
    </Layout>
  );
}

FormSubmission.PreviewProps = {
  formName: "Contact form",
  agencyName: "Impronta Models",
  contactName: "Sofia Martínez",
  contactEmail: "sofia@example.com",
  submittedAt: new Date().toISOString(),
  inboxUrl: "https://tulala.digital/impronta/admin/website/forms",
  payloadFields: [
    { label: "message", value: "I'm interested in booking a photographer for my wedding." },
    { label: "phone", value: "+52 55 1234 5678" },
  ],
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const sectionLabel: React.CSSProperties = { margin: "16px 0 6px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#888888" };
const note: React.CSSProperties = { margin: "12px 0 0", fontSize: "13px", color: "#777777" };
