import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  talentName: string | null;
  dashboardUrl: string;
  brand?: EmailBrand;
}

export default function Welcome({ talentName, dashboardUrl, brand }: Props) {
  const t = getEmailCopy(brand?.locale)["account.talent_welcome"];
  const firstName = talentName?.trim() ? talentName.split(" ")[0] : t.fallbackName;

  return (
    <Layout preview={t.preview} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name: firstName })}</Text>
      <Text style={note}>{t.note}</Text>
      <Button href={dashboardUrl}>{t.button}</Button>
    </Layout>
  );
}

Welcome.PreviewProps = {
  talentName: "Tina Rossi",
  dashboardUrl: "https://tulala.digital/talent",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
