import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

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
  const t = getEmailCopy(brand?.locale)["talent.payout_reversed"];
  const name = talentName ?? t.fallbackName;
  // The catalog passes an English clause; re-localize the two known cases and
  // fall back to whatever was passed for anything else.
  const reason =
    reasonClause === "the client's payment was disputed"
      ? t.reasonDispute
      : reasonClause === "the client's payment was refunded"
        ? t.reasonRefund
        : reasonClause;

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, reason })}</Text>
      <FieldTable fields={[{ label: t.labelAmountReversed, value: amountReversed }]} />
      <Text style={note}>{t.note}</Text>
      <Button href={payoutsUrl}>{t.button}</Button>
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
