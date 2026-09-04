import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

/**
 * A chargeback opened against a platform charge.
 *
 * WHY THIS TEMPLATE EXISTS: `payment.dispute.opened.platform` was `in_app`
 * only, so a chargeback produced one bell for platform admins and no email to
 * anyone. Worse, the EVIDENCE DEADLINE -- the only genuinely time-critical part
 * -- reached `logServerError` and nothing else, while the in-app body said
 * "Stripe needs evidence before the deadline" without carrying the deadline.
 *
 * Disputes are LOST BY DEFAULT when unanswered, and the amount plus Stripe's
 * dispute fee stay withdrawn. So the deadline belongs in the subject line, not
 * in an error log.
 */
interface Props {
  amount: string;
  reason: string;
  /** Pre-formatted for the recipient's locale, or null when Stripe set none. */
  dueDate: string | null;
  disputeId: string;
  stripeUrl: string;
  brand?: EmailBrand;
}

export default function DisputeOpenedAlert({
  amount,
  reason,
  dueDate,
  disputeId,
  stripeUrl,
  brand,
}: Props) {
  const t = getEmailCopy(brand?.locale)["platform.payment_dispute_opened"];

  // The deadline row is omitted rather than shown empty when Stripe has not set
  // one -- an "Evidence due: —" row reads as a system fault, not as an absence.
  const fields: { label: string; value: string }[] = [
    { label: t.amountRowLabel, value: amount },
    { label: t.reasonRowLabel, value: reason },
    ...(dueDate ? [{ label: t.dueRowLabel, value: dueDate }] : []),
    { label: t.disputeRowLabel, value: disputeId },
  ];

  return (
    <Layout preview={t.preview} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.body, { amount, reason })}</Text>
      <FieldTable fields={fields} />
      <Text style={note}>{t.note}</Text>
      <Button href={stripeUrl}>{t.button}</Button>
    </Layout>
  );
}

DisputeOpenedAlert.PreviewProps = {
  amount: "$450.00",
  reason: "fraudulent",
  dueDate: "12 September 2026",
  disputeId: "du_1ABCdefGHIjklMNO",
  stripeUrl: "https://dashboard.stripe.com/disputes/du_1ABCdefGHIjklMNO",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
