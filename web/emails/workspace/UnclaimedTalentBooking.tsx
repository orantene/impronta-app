import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

interface Props {
  recipientName: string | null;
  talentNames: string | null;
  contactName: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  inquiryUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

/** Workspace staff notice: a booking landed on a talent who has no account yet. */
export default function UnclaimedTalentBooking({
  recipientName,
  talentNames,
  contactName,
  eventDate,
  eventLocation,
  inquiryUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["workspace.unclaimed_talent_booking"];
  const fields = [
    eventDate ? { label: t.labelDate, value: eventDate } : null,
    eventLocation ? { label: t.labelLocation, value: eventLocation } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout preview={t.preview} brand={brand} unsubscribeUrl={unsubscribeUrl} categoryLabel={categoryLabel}>
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>
        {interpolate(t.intro, {
          name: recipientName ?? t.fallbackName,
          talent: talentNames ?? t.fallbackTalent,
          event: contactName ?? t.fallbackEvent,
        })}
      </Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button brand={brand} href={inquiryUrl}>{t.button}</Button>
    </Layout>
  );
}

UnclaimedTalentBooking.PreviewProps = {
  recipientName: "Maria",
  talentNames: "Tina Rossi",
  contactName: "Sofia",
  eventDate: "14 Jun 2026",
  eventLocation: "Lake Como, Italy",
  inquiryUrl: "https://tulala.digital/admin/work/abc",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
