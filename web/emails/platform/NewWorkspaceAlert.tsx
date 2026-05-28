import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  workspaceName: string;
  ownerEmail: string;
  planLabel: string;
  adminUrl: string;
  brand?: EmailBrand;
}

export default function NewWorkspaceAlert({
  workspaceName,
  ownerEmail,
  planLabel,
  adminUrl,
  brand,
}: Props) {
  const fields: { label: string; value: string }[] = [
    { label: "Owner", value: ownerEmail },
    { label: "Plan", value: planLabel },
  ];

  return (
    <Layout preview="New workspace signed up" brand={brand}>
      <Heading style={h2}>New workspace signed up</Heading>
      <Text style={body}>{workspaceName} just created a workspace on Tulala.</Text>
      <FieldTable fields={fields} />
      <Text style={note}>Review it in the platform admin console.</Text>
      <Button href={adminUrl}>Open in admin →</Button>
    </Layout>
  );
}

NewWorkspaceAlert.PreviewProps = {
  workspaceName: "Impronta Models",
  ownerEmail: "owner@impronta.com",
  planLabel: "Agency",
  adminUrl: "https://tulala.digital/platform/admin/tenants",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
