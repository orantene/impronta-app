import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  recipientName: string | null;
  planLabel: string | null;
  /** Pre-formatted trial-end date, e.g. "21 June 2026". */
  trialEndsAt: string | null;
  billingUrl: string;
  brand?: EmailBrand;
}

export default function TrialWillEnd({
  recipientName,
  planLabel,
  trialEndsAt,
  billingUrl,
  brand,
}: Props) {
  const t = getEmailCopy(brand?.locale)["billing.trial_will_end.workspace"];
  const name = recipientName ?? "there";
  const plan = planLabel ?? "your plan";

  const fields = [
    { label: t.fieldPlan, value: plan },
    ...(trialEndsAt ? [{ label: t.fieldTrialEnds, value: trialEndsAt }] : []),
  ];

  const intro = interpolate(trialEndsAt ? t.introWithDate : t.introNoDate, {
    name,
    plan,
    trialEnds: trialEndsAt,
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

TrialWillEnd.PreviewProps = {
  recipientName: "Sofía Herrera",
  planLabel: "Pro",
  trialEndsAt: "21 June 2026",
  billingUrl: "https://tulala.digital/talent/settings",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
