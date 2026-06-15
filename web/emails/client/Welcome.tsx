import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  clientName: string | null;
  dashboardUrl: string;
  brand?: EmailBrand;
}

export default function Welcome({ clientName, dashboardUrl, brand }: Props) {
  const t = getEmailCopy(brand?.locale)["client.welcome"];
  const name = clientName ?? "there";

  return (
    <Layout preview={t.preview} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name })}</Text>
      <Text style={note}>{t.note}</Text>
      <Button href={dashboardUrl}>{t.button}</Button>
    </Layout>
  );
}

Welcome.PreviewProps = {
  clientName: "Marco Bianchi",
  dashboardUrl: "https://tulala.digital/client",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
