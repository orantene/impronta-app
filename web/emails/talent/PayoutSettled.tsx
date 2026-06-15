import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

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
  const t = getEmailCopy(brand?.locale)["talent.payout_settled"];
  const name = talentName ?? t.fallbackName;
  const event = contactName ?? t.fallbackEvent;

  const fields = [{ label: t.labelAmount, value: amountSettled }].filter(
    (f) => Boolean(f.value),
  );

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, event })}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button href={payoutsUrl}>{t.button}</Button>
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
