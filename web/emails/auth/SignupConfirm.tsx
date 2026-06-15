import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy } from "@/lib/notifications/email-copy";

interface Props {
  confirmUrl: string;
  brand?: EmailBrand;
}

export default function SignupConfirm({ confirmUrl, brand }: Props) {
  const t = getEmailCopy(brand?.locale)["auth.signup"];
  return (
    <Layout preview={t.preview} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{t.intro}</Text>
      <Text style={note}>{t.note}</Text>
      <Button href={confirmUrl}>{t.button}</Button>
    </Layout>
  );
}

SignupConfirm.PreviewProps = {
  confirmUrl: "https://tulala.digital/auth/confirm?token=abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
