import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

/**
 * Review received (STANDING v2, spec §Phase 2) — a talent is told a client just
 * published a review of them. Dispatched by the `submitTalentReviewAction`
 * producer after a successful publish, resolving the talent's account from
 * `talent_profiles.user_id`.
 *
 * The email carries no review text or rating (the talent reads it in context on
 * their Reviews page, where they can also reply); the CTA links there.
 */

interface Props {
  talentName: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  reviewsUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function ReviewReceived({
  talentName,
  eventTitle,
  eventDate,
  reviewsUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["review.received"];
  const name = talentName ?? t.fallbackName;

  const fields = [
    eventTitle ? { label: t.labelEvent, value: eventTitle } : null,
    eventDate ? { label: t.labelDate, value: eventDate } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name })}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button href={reviewsUrl}>{t.button}</Button>
    </Layout>
  );
}

ReviewReceived.PreviewProps = {
  talentName: "Tina Rossi",
  eventTitle: "Lakeside Wedding",
  eventDate: "14 Jun 2026",
  reviewsUrl: "https://tulala.digital/talent/reviews",
  categoryLabel: "reviews",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
