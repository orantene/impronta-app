import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  magicUrl: string;
  brand?: EmailBrand;
}

export default function MagicLink({ magicUrl, brand }: Props) {
  return (
    <Layout preview="Your sign-in link" brand={brand}>
      <Heading style={h2}>Sign in to Tulala</Heading>
      <Text style={body}>
        Click the button below to sign in. This link is single-use and expires in 1 hour.
      </Text>
      <Text style={note}>If you didn&apos;t request this, you can safely ignore this email.</Text>
      <Button href={magicUrl}>Sign in →</Button>
    </Layout>
  );
}

MagicLink.PreviewProps = {
  magicUrl: "https://tulala.digital/auth/magic?token=abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
