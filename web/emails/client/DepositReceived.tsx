import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

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
  const name = clientName ?? "there";
  const event = contactName ?? "your booking";

  const fields = [
    { label: "Deposit paid", value: depositPaid },
    ...(balanceDue ? [{ label: "Balance due", value: balanceDue }] : []),
    { label: "Date", value: paymentDate },
  ];

  return (
    <Layout
      preview="Deposit received — balance due to confirm your booking"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>Deposit received</Heading>
      <Text style={body}>
        Hi {name}, we&apos;ve received your deposit for {event}. To confirm the booking, pay the
        remaining balance{balanceDue ? ` of ${balanceDue}` : ""}.
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>Your booking is held — paying the balance locks it in.</Text>
      <Button href={payBalanceUrl}>Pay balance →</Button>
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
