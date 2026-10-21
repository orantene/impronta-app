import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  /** failed: a monthly automatic charge did not go through. canceled: automatic payments stopped. */
  kind: "failed" | "canceled";
  recipientName?: string | null;
  workspaceName: string | null;
  period: string | null;
  rentUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

/** TUL-1601: the member is told when an automatic rent charge fails, or automatic payments stop. */
export default function RentAutopayNotice({ kind, workspaceName, period, rentUrl, brand, unsubscribeUrl, categoryLabel }: Props) {
  const copy = getEmailCopy(brand?.locale);
  const t = kind === "failed" ? copy["rent.autopay_failed"] : copy["rent.autopay_canceled"];
  const isEs = (brand?.locale ?? "").toLowerCase().startsWith("es");
  const vars = { who: workspaceName ?? (isEs ? "tu estudio" : "your studio"), period: period ?? "" };
  return (
    <Layout preview={interpolate(t.preview, vars)} brand={brand} unsubscribeUrl={unsubscribeUrl} categoryLabel={categoryLabel}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, vars)}</Text>
      <Button brand={brand} href={rentUrl}>{t.button}</Button>
    </Layout>
  );
}

RentAutopayNotice.PreviewProps = {
  kind: "failed",
  workspaceName: "Studio Norte",
  period: "2026-11",
  rentUrl: "https://app.tulala.digital/talent/rent-proposals",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", lineHeight: "1.6", color: "#333" };
