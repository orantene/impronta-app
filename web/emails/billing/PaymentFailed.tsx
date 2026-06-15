import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  agencyName: string;
  amountDue: string;
  billingUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function PaymentFailed({
  agencyName,
  amountDue,
  billingUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["workspace.payment_failed"];
  const fields = [{ label: "Amount due", value: amountDue }].filter((f) => Boolean(f.value));

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { brand: agencyName })}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button href={billingUrl}>{t.button}</Button>
    </Layout>
  );
}

PaymentFailed.PreviewProps = {
  agencyName: "Impronta Models",
  amountDue: "EUR 49.00",
  billingUrl: "https://tulala.digital/admin/settings/billing",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
