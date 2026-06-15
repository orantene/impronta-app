import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  clientName: string | null;
  contactName: string | null;
  depositPaid: string;
  /** Remaining balance, when it can be computed from the offer total. */
  balanceDue: string | null;
  paymentDate: string;
  payBalanceUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function DepositReceived({
  clientName,
  contactName,
  depositPaid,
  balanceDue,
  paymentDate,
  payBalanceUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["client.deposit_received"];
  const name = clientName ?? "there";
  const event = contactName ?? "your booking";
  const balanceClause = balanceDue ? interpolate(t.balanceClause, { balance: balanceDue }) : "";

  const fields = [
    { label: t.depositLabel, value: depositPaid },
    ...(balanceDue ? [{ label: t.balanceLabel, value: balanceDue }] : []),
    { label: t.dateLabel, value: paymentDate },
  ];

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, event, balanceClause })}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button href={payBalanceUrl}>{t.button}</Button>
    </Layout>
  );
}

DepositReceived.PreviewProps = {
  clientName: "Marco Bianchi",
  contactName: "Sofia's Wedding",
  depositPaid: "EUR 675.00",
  balanceDue: "EUR 1,575.00",
  paymentDate: "28 May 2026",
  payBalanceUrl: "https://tulala.digital/client/bookings/abc123?tab=payment",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
