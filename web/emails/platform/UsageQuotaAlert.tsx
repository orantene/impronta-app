import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  workspaceName: string;
  metricLabel: string;
  usageLabel: string;
  adminUrl: string;
  brand?: EmailBrand;
}

export default function UsageQuotaAlert({
  workspaceName,
  metricLabel,
  usageLabel,
  adminUrl,
  brand,
}: Props) {
  const t = getEmailCopy(brand?.locale)["platform.workspace_over_quota"];
  const fields: { label: string; value: string }[] = [{ label: t.usageRowLabel, value: usageLabel }];

  return (
    <Layout preview={t.preview} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.body, { workspaceName, metricLabel })}</Text>
      <FieldTable fields={fields} />
      <Text style={note}>{t.note}</Text>
      <Button href={adminUrl}>{t.button}</Button>
    </Layout>
  );
}

UsageQuotaAlert.PreviewProps = {
  workspaceName: "Impronta Models",
  metricLabel: "storage",
  usageLabel: "12.4 GB of 10 GB",
  adminUrl: "https://tulala.digital/platform/admin/tenants",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
