import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  talentName: string | null;
  contactName: string | null;
  amountSettled: string;
  payoutsUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function PayoutSettled({
  talentName,
  contactName,
  amountSettled,
  payoutsUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = talentName ?? "there";
  const event = contactName ?? "your booking";

  const fields = [{ label: "Amount", value: amountSettled }].filter(
    (f) => Boolean(f.value),
  );

  return (
    <Layout
      preview="Your payout is on its way"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>Your payout is on its way</Heading>
      <Text style={body}>
        Hi {name}, your payout for {event} has been settled.
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>Track this and past payouts from your payout settings.</Text>
      <Button href={payoutsUrl}>View payouts →</Button>
    </Layout>
  );
}

PayoutSettled.PreviewProps = {
  talentName: "Tina Rossi",
  contactName: "Sofia's Wedding",
  amountSettled: "EUR 1,800.00",
  payoutsUrl: "https://tulala.digital/talent/settings/payouts",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
