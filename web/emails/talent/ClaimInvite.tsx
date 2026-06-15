import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

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
  const t = getEmailCopy(brand?.locale)["talent.claim_invite"];
  const firstName = talentDisplayName?.trim() ? talentDisplayName.split(" ")[0] : t.fallbackName;

  return (
    <Layout preview={interpolate(t.preview, { brand: agencyName })} brand={brand}>
      <Text style={body}>{interpolate(t.greeting, { name: firstName })}</Text>
      <Heading style={h2}>{interpolate(t.heading, { brand: agencyName })}</Heading>
      <Text style={body}>{interpolate(t.intro, { brand: agencyName })}</Text>
      {expiresLabel ? (
        <Text style={note}>{interpolate(t.expires, { expiresLabel })}</Text>
      ) : null}
      <Button href={redeemUrl}>{t.button}</Button>
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
