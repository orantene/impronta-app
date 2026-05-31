import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  confirmUrl: string;
  newEmail: string;
  brand?: EmailBrand;
}

export default function EmailChange({ confirmUrl, newEmail, brand }: Props) {
  return (
    <Layout preview="Confirm your new email" brand={brand}>
      <Heading style={h2}>Confirm your new email</Heading>
      <Text style={body}>
        A request was made to change the email address on your account to {newEmail}. Click the
        button below to confirm the change.
      </Text>
      <Text style={note}>
        If you didn&apos;t request this, you can safely ignore this email and your address will stay
        unchanged.
      </Text>
      <Button href={confirmUrl}>Confirm new email →</Button>
    </Layout>
  );
}

EmailChange.PreviewProps = {
  confirmUrl: "https://tulala.digital/auth/email-change?token=abc123",
  newEmail: "new@example.com",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
