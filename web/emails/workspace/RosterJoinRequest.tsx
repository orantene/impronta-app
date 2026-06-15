import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  recipientName?: string | null;
  talentName: string | null;
  reviewUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function RosterJoinRequest({
  talentName,
  reviewUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["roster.join_requested"];
  const isEs = (brand?.locale ?? "").toLowerCase().startsWith("es");
  const who = talentName ?? (isEs ? "Un talento" : "A talent");

  return (
    <Layout
      preview={interpolate(t.preview, { who })}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { who })}</Text>
      <Button href={reviewUrl}>{t.button}</Button>
    </Layout>
  );
}

RosterJoinRequest.PreviewProps = {
  talentName: "Tina Rossi",
  reviewUrl: "https://impronta.tulala.digital/impronta/admin/roster/registration",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
