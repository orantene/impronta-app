import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

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
  const fields: { label: string; value: string }[] = [
    { label: "Usage", value: usageLabel },
  ];

  return (
    <Layout preview="Workspace over quota" brand={brand}>
      <Heading style={h2}>Workspace over quota</Heading>
      <Text style={body}>
        {workspaceName} has exceeded its {metricLabel} quota.
      </Text>
      <FieldTable fields={fields} />
      <Text style={note}>Review usage and consider reaching out about an upgrade.</Text>
      <Button href={adminUrl}>Open in admin →</Button>
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
