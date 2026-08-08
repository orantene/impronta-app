import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy } from "@/lib/notifications/email-copy";

interface Props {
  confirmUrl: string;
  /**
   * P4 — `code` is Supabase's 6-digit email OTP (`email_data.token`). The
   * passwordless client flow asks for a code on the page, so the same email
   * has to carry it; the button stays the primary action for everyone else.
   */
  code?: string;
  brand?: EmailBrand;
}

export default function SignupConfirm({ confirmUrl, code, brand }: Props) {
  const t = getEmailCopy(brand?.locale)["auth.signup"];
  return (
    <Layout preview={t.preview} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{t.intro}</Text>
      <Text style={note}>{t.note}</Text>
      <Button href={confirmUrl}>{t.button}</Button>
      {code ? (
        <>
          <Text style={codeLabel}>{t.codeLabel}</Text>
          <Text style={codeValue}>{code}</Text>
        </>
      ) : null}
    </Layout>
  );
}

SignupConfirm.PreviewProps = {
  confirmUrl: "https://tulala.digital/auth/confirm?token=abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const codeLabel: React.CSSProperties = { margin: "20px 0 6px", fontSize: "13px", color: "#777777" };
const codeValue: React.CSSProperties = {
  margin: "0",
  fontSize: "26px",
  fontWeight: 700,
  letterSpacing: "6px",
  color: "#1a1a1a",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
