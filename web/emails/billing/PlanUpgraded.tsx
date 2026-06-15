import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  agencyName: string;
  toPlan: string;
  billingUrl: string;
  brand?: EmailBrand;
}

export default function PlanUpgraded({ agencyName, toPlan, billingUrl, brand }: Props) {
  const t = getEmailCopy(brand?.locale)["billing.plan_upgraded"];
  return (
    <Layout preview={interpolate(t.preview, { plan: toPlan })} brand={brand}>
      <Heading style={h2}>{interpolate(t.heading, { plan: toPlan })}</Heading>
      <Text style={body}>{interpolate(t.intro, { brand: agencyName, plan: toPlan })}</Text>
      <Text style={note}>{t.note}</Text>
      <Button href={billingUrl}>{t.button}</Button>
    </Layout>
  );
}

PlanUpgraded.PreviewProps = {
  agencyName: "Impronta Models",
  toPlan: "Agency",
  billingUrl: "https://tulala.digital/admin/settings/billing",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
