import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  confirmUrl: string;
  brand?: EmailBrand;
}

export default function SignupConfirm({ confirmUrl, brand }: Props) {
  return (
    <Layout preview="Confirm your email to get started" brand={brand}>
      <Heading style={h2}>Confirm your email</Heading>
      <Text style={body}>
        Thanks for signing up. Click the button below to confirm your email address and activate
        your account.
      </Text>
      <Text style={note}>This link expires in 24 hours.</Text>
      <Button href={confirmUrl}>Confirm email →</Button>
    </Layout>
  );
}

SignupConfirm.PreviewProps = {
  confirmUrl: "https://tulala.digital/auth/confirm?token=abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
