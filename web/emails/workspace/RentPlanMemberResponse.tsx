import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  /** Which message: the member declined the proposal, or ended an active plan. */
  outcome: "declined" | "ended";
  recipientName?: string | null;
  memberName: string | null;
  rentUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

/** TUL-1448: the workspace owner is told when a member declines or ends a station rent plan. */
export default function RentPlanMemberResponse({ outcome, memberName, rentUrl, brand, unsubscribeUrl, categoryLabel }: Props) {
  const copy = getEmailCopy(brand?.locale);
  const t = outcome === "declined" ? copy["rent.plan_declined"] : copy["rent.plan_ended"];
  const isEs = (brand?.locale ?? "").toLowerCase().startsWith("es");
  const who = memberName ?? (isEs ? "Un miembro" : "A member");

  return (
    <Layout preview={interpolate(t.preview, { who })} brand={brand} unsubscribeUrl={unsubscribeUrl} categoryLabel={categoryLabel}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { who })}</Text>
      <Button brand={brand} href={rentUrl}>{t.button}</Button>
    </Layout>
  );
}

RentPlanMemberResponse.PreviewProps = {
  outcome: "declined",
  memberName: "Tina Rossi",
  rentUrl: "https://impronta.tulala.digital/impronta/admin/settings/rent",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
