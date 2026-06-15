import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy } from "@/lib/notifications/email-copy";

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
  const t = getEmailCopy(brand?.locale)["platform.workspace_signup_failed"];
  const fields: { label: string; value: string }[] = [
    { label: t.emailLabel, value: attemptedEmail },
    { label: t.reasonLabel, value: reason },
  ];

  return (
    <Layout preview={t.preview} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{t.body}</Text>
      <FieldTable fields={fields} />
      <Text style={note}>{t.note}</Text>
      <Button href={adminUrl}>{t.button}</Button>
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
