import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

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
  const firstName = ownerName?.trim() ? ownerName.split(" ")[0] : "there";

  return (
    <Layout preview={`Your ${workspaceName} workspace is ready`} brand={brand}>
      <Heading style={h2}>Your workspace is ready</Heading>
      <Text style={body}>
        Welcome, {firstName}. Your {planLabel} workspace, {workspaceName}, is live. Add your first
        talent, customize your public page, and start taking inquiries.
      </Text>
      <Text style={note}>
        Public link: {publicUrl}
      </Text>
      <Button href={adminUrl}>Open your dashboard →</Button>
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
