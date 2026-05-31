import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  resetUrl: string;
  brand?: EmailBrand;
}

export default function PasswordReset({ resetUrl, brand }: Props) {
  return (
    <Layout preview="Reset your password" brand={brand}>
      <Heading style={h2}>Reset your password</Heading>
      <Text style={body}>
        Someone requested a password reset for your account. Click the button below to choose a new
        password.
      </Text>
      <Text style={note}>
        This link expires in 1 hour. If you didn&apos;t request this, you can safely ignore this
        email and your password will stay unchanged.
      </Text>
      <Button href={resetUrl}>Reset password →</Button>
    </Layout>
  );
}

PasswordReset.PreviewProps = {
  resetUrl: "https://tulala.digital/auth/reset?token=abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
