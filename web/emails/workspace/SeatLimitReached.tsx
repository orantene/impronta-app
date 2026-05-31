import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";

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
  const name = recipientName ?? "there";
  const workspace = workspaceName ?? "Your workspace";
  const plan = planLabel ?? "current";

  const fields = [
    activeCount != null ? { label: "Roster", value: `${activeCount} talent` } : null,
    seatLimit != null ? { label: "Plan limit", value: `${seatLimit} seats (${plan})` } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview="Your roster is over its plan limit"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>You&apos;ve reached your roster limit</Heading>
      <Text style={body}>
        Hi {name}, {workspace} now has more talent on its roster than your {plan}{" "}
        plan allows. To keep adding talent — and make sure everyone stays visible
        and bookable — upgrade your plan or adjust your roster.
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>
        Nothing is removed automatically. This is a heads-up so you can choose how
        to handle it.
      </Text>
      <Button href={accountUrl}>Manage your plan →</Button>
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
