import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy } from "@/lib/notifications/email-copy";

interface Props {
  magicUrl: string;
  brand?: EmailBrand;
}

export default function MagicLink({ magicUrl, brand }: Props) {
  const t = getEmailCopy(brand?.locale)["auth.magiclink"];
  return (
    <Layout preview={t.preview} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{t.intro}</Text>
      <Text style={note}>{t.note}</Text>
      <Button href={magicUrl}>{t.button}</Button>
    </Layout>
  );
}

MagicLink.PreviewProps = {
  magicUrl: "https://tulala.digital/auth/magic?token=abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
