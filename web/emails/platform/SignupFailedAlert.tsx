import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  attemptedEmail: string;
  reason: string;
  adminUrl: string;
  brand?: EmailBrand;
}

export default function SignupFailedAlert({
  attemptedEmail,
  reason,
  adminUrl,
  brand,
}: Props) {
  const fields: { label: string; value: string }[] = [
    { label: "Email", value: attemptedEmail },
    { label: "Reason", value: reason },
  ];

  return (
    <Layout preview="Workspace signup failed" brand={brand}>
      <Heading style={h2}>Workspace signup failed</Heading>
      <Text style={body}>
        A workspace signup didn&apos;t complete and may need a manual follow-up.
      </Text>
      <FieldTable fields={fields} />
      <Text style={note}>Check the logs and follow up if needed.</Text>
      <Button href={adminUrl}>Open in admin →</Button>
    </Layout>
  );
}

SignupFailedAlert.PreviewProps = {
  attemptedEmail: "newuser@example.com",
  reason: "Stripe checkout abandoned",
  adminUrl: "https://tulala.digital/platform/admin/tenants",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
