import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  ownerName: string | null;
  workspaceName: string;
  /** Already-friendly plan label, e.g. "Free", "Studio", "Agency". */
  planLabel: string;
  adminUrl: string;
  publicUrl: string;
  brand?: EmailBrand;
}

export default function Welcome({
  ownerName,
  workspaceName,
  planLabel,
  adminUrl,
  publicUrl,
  brand,
}: Props) {
  const t = getEmailCopy(brand?.locale)["workspace.signup_welcome"];
  const isEs = (brand?.locale ?? "").toLowerCase().startsWith("es");
  const firstName = ownerName?.trim() ? ownerName.split(" ")[0] : isEs ? "hola" : "there";

  return (
    <Layout preview={interpolate(t.preview, { workspace: workspaceName })} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>
        {interpolate(t.intro, { name: firstName, plan: planLabel, workspace: workspaceName })}
      </Text>
      <Text style={note}>{interpolate(t.note, { publicUrl })}</Text>
      <Button href={adminUrl}>{t.button}</Button>
    </Layout>
  );
}

Welcome.PreviewProps = {
  ownerName: "Mara Conti",
  workspaceName: "Studio Conti",
  planLabel: "Free",
  adminUrl: "https://tulala.digital/studio-conti/admin",
  publicUrl: "https://tulala.digital/studio-conti",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0 0 20px", fontSize: "13px", color: "#777777" };
