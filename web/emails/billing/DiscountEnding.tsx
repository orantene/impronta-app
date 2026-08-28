import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  recipientName: string | null;
  planLabel: string | null;
  /** Pre-formatted discount-end date, e.g. "21 June 2026". */
  discountEndsAt: string | null;
  /** Pre-formatted amount they will be charged next, e.g. "$29". */
  nextAmount: string | null;
  billingUrl: string;
  brand?: EmailBrand;
}

/**
 * Sent a few days BEFORE a subscription discount lapses.
 *
 * A time-boxed offer ("two months free", "50% off for six months") ends
 * silently in Stripe: the next invoice simply costs more. That surprise is the
 * single most common way a generous campaign turns into refund requests and
 * angry cancellations, so the warning is part of running the campaign, not a
 * nicety. The tone is deliberately calm and asks for nothing: the reader has
 * no action to take, which is exactly why the mail is trustworthy.
 */
export default function DiscountEnding({
  recipientName,
  planLabel,
  discountEndsAt,
  nextAmount,
  billingUrl,
  brand,
}: Props) {
  const t = getEmailCopy(brand?.locale)["billing.discount_ending.workspace"];
  const name = recipientName ?? "there";
  const plan = planLabel ?? "your plan";

  const fields = [
    { label: t.fieldPlan, value: plan },
    ...(discountEndsAt ? [{ label: t.fieldDiscountEnds, value: discountEndsAt }] : []),
    ...(nextAmount ? [{ label: t.fieldNextAmount, value: nextAmount }] : []),
  ];

  const intro = interpolate(discountEndsAt ? t.introWithDate : t.introNoDate, {
    name,
    plan,
    discountEnds: discountEndsAt,
  });

  return (
    <Layout preview={t.preview} brand={brand}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{intro}</Text>
      <FieldTable fields={fields} />
      <Text style={note}>{t.note}</Text>
      <Button href={billingUrl}>{t.button}</Button>
    </Layout>
  );
}

DiscountEnding.PreviewProps = {
  recipientName: "Alejandra Ruiz",
  planLabel: "Agency",
  discountEndsAt: "21 June 2026",
  nextAmount: "$79",
  billingUrl: "https://tulala.digital/admin/account",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
