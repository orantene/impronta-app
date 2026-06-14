import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  agencyName: string;
  talentDisplayName: string | null;
  redeemUrl: string;
  /**
   * Optional — token-based claim invites carry an expiry; the roster "sign up
   * with this email to claim" path has no token, so the line is omitted.
   */
  expiresLabel?: string;
  brand?: EmailBrand;
}

export default function ClaimInvite({
  agencyName,
  talentDisplayName,
  redeemUrl,
  expiresLabel,
  brand,
}: Props) {
  const firstName = talentDisplayName?.trim() ? talentDisplayName.split(" ")[0] : "there";

  return (
    <Layout preview={`Claim your profile on ${agencyName}`} brand={brand}>
      <Text style={body}>Hi {firstName},</Text>
      <Heading style={h2}>Claim your profile on {agencyName}</Heading>
      <Text style={body}>
        {agencyName} added you to their roster. Claim your profile to manage bookings, reply to
        inquiries, and edit your photos and bio.
      </Text>
      {expiresLabel ? <Text style={note}>Link expires {expiresLabel}.</Text> : null}
      <Button href={redeemUrl}>Claim profile →</Button>
    </Layout>
  );
}

ClaimInvite.PreviewProps = {
  agencyName: "Impronta Models",
  talentDisplayName: "Tina Rossi",
  redeemUrl: "https://tulala.digital/claim?token=abc123",
  expiresLabel: "5 Jun 2026",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
