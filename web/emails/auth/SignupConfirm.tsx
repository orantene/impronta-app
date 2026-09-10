import { Heading, Section, Text } from "@react-email/components";
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

/** "20344125" → "2034 4125"; odd lengths keep the larger group first. */
function groupDigits(code: string): string {
  if (code.length < 6) return code;
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

export default function SignupConfirm({ confirmUrl, code, brand }: Props) {
  const t = getEmailCopy(brand?.locale)["auth.signup"];
  return (
    <Layout preview={t.preview} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{code ? t.introWithCode : t.intro}</Text>
      {code ? (
        <Section style={codeBox}>
          {/* Wrapped in an inert anchor so iOS Mail / Gmail do not turn eight
              digits into a tappable blue phone number. Grouped 4+4 for reading
              against the boxes on the page; the page strips the space. */}
          <a href="#" style={codeValue}>
            {groupDigits(code)}
          </a>
        </Section>
      ) : null}
      <Button brand={brand} href={confirmUrl}>{t.button}</Button>
      <Text style={note}>{t.note}</Text>
    </Layout>
  );
}

SignupConfirm.PreviewProps = {
  confirmUrl: "https://tulala.digital/auth/confirm?token=abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const codeBox: React.CSSProperties = {
  margin: "0 0 20px",
  padding: "16px",
  textAlign: "center",
  backgroundColor: "#f4f4f2",
  borderRadius: "10px",
};
const codeValue: React.CSSProperties = {
  fontSize: "30px",
  fontWeight: 700,
  letterSpacing: "4px",
  color: "#1a1a1a",
  textDecoration: "none",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
