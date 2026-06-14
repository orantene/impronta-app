import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  talentName: string | null;
  amountReversed: string;
  /** e.g. "the client's payment was refunded" / "…was disputed". */
  reasonClause: string;
  payoutsUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function PayoutReversed({
  talentName,
  amountReversed,
  reasonClause,
  payoutsUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = talentName ?? "there";
  return (
    <Layout
      preview="A payout was reversed"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>A payout was reversed</Heading>
      <Text style={body}>
        Hi {name}, a payout was reversed because {reasonClause}. If you think this is a mistake,
        contact your coordinator.
      </Text>
      <FieldTable fields={[{ label: "Amount reversed", value: amountReversed }]} />
      <Text style={note}>Your earnings dashboard always shows your current payout status.</Text>
      <Button href={payoutsUrl}>View payouts →</Button>
    </Layout>
  );
}

PayoutReversed.PreviewProps = {
  talentName: "Sofía Herrera",
  amountReversed: "USD 800.00",
  reasonClause: "the client's payment was refunded",
  payoutsUrl: "https://tulala.digital/talent/settings/payouts",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
