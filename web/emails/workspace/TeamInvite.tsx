import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  inviterName: string;
  agencyName: string;
  roleLabel: string;
  redeemUrl: string;
  expiresLabel: string;
  brand?: EmailBrand;
}

export default function TeamInvite({
  inviterName,
  agencyName,
  roleLabel,
  redeemUrl,
  expiresLabel,
  brand,
}: Props) {
  return (
    <Layout preview={`Join ${agencyName} on Tulala`} brand={brand}>
      <Heading style={h2}>Join {agencyName} on Tulala</Heading>
      <Text style={body}>
        {inviterName} added you as {roleLabel}. Accept the invite to get into the workspace.
      </Text>
      <Text style={note}>Link expires {expiresLabel}.</Text>
      <Button href={redeemUrl}>Accept invite →</Button>
    </Layout>
  );
}

TeamInvite.PreviewProps = {
  inviterName: "Giulia Conti",
  agencyName: "Impronta Models",
  roleLabel: "Manager",
  redeemUrl: "https://tulala.digital/invite?token=abc123",
  expiresLabel: "5 Jun 2026",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
