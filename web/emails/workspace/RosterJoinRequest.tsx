import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  recipientName?: string | null;
  talentName: string | null;
  reviewUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function RosterJoinRequest({
  talentName,
  reviewUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const who = talentName ?? "A talent";

  return (
    <Layout
      preview={`${who} wants to join your roster`}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>New roster request</Heading>
      <Text style={body}>
        {who} asked to join your roster from your public site. Review the request
        to approve or decline.
      </Text>
      <Button href={reviewUrl}>Review request →</Button>
    </Layout>
  );
}

RosterJoinRequest.PreviewProps = {
  talentName: "Tina Rossi",
  reviewUrl: "https://impronta.tulala.digital/impronta/admin/roster/registration",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
