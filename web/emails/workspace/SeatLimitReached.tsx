import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  recipientName: string | null;
  workspaceName: string | null;
  activeCount: number | null;
  seatLimit: number | null;
  planLabel: string | null;
  accountUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function SeatLimitReached({
  recipientName,
  workspaceName,
  activeCount,
  seatLimit,
  planLabel,
  accountUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["workspace.over_seat_limit"];
  const isEs = (brand?.locale ?? "").toLowerCase().startsWith("es");
  const name = recipientName ?? (isEs ? "hola" : "there");
  const workspace = workspaceName ?? (isEs ? "Tu espacio de trabajo" : "Your workspace");
  const plan = planLabel ?? (isEs ? "actual" : "current");

  const fields = [
    activeCount != null
      ? { label: t.fieldRoster, value: interpolate(t.fieldRosterValue, { count: String(activeCount) }) }
      : null,
    seatLimit != null
      ? {
          label: t.fieldPlanLimit,
          value: interpolate(t.fieldPlanLimitValue, { seats: String(seatLimit), plan }),
        }
      : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, workspace, plan })}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button href={accountUrl}>{t.button}</Button>
    </Layout>
  );
}

SeatLimitReached.PreviewProps = {
  recipientName: "Giulia Conti",
  workspaceName: "Impronta Models",
  activeCount: 27,
  seatLimit: 25,
  planLabel: "Studio",
  accountUrl: "https://tulala.digital/admin/account",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0 0 4px", fontSize: "13px", color: "#777777", lineHeight: 1.5 };
