import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

/**
 * Review-request reminder (STANDING v2, spec §Phase 2) — a single, gentle
 * follow-up for a still-`pending` review request about a week after the invite.
 * Dispatched by the `review-request-reminder` producer, which selects pending
 * rows older than 7 days with `reminded_at IS NULL` and marks them afterward, so
 * a client receives at most one reminder.
 *
 * Same neutral, no-incentive tone as the invite (FTC). CTA points at the same
 * single-use `/review/{token}` landing page.
 */

interface Props {
  clientName: string | null;
  talentName: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  reviewUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function ReviewRequestReminder({
  clientName,
  talentName,
  eventTitle,
  eventDate,
  reviewUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["review.request_reminder"];
  const name = clientName ?? t.fallbackName;
  const talent = talentName ?? t.fallbackTalent;
  const event = eventTitle ?? t.fallbackEvent;

  const fields = [
    eventTitle ? { label: t.labelEvent, value: eventTitle } : null,
    eventDate ? { label: t.labelDate, value: eventDate } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Layout
      preview={interpolate(t.preview, { talent })}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{interpolate(t.heading, { name })}</Heading>
      <Text style={body}>{interpolate(t.intro, { talent, event })}</Text>
      {fields.length > 0 && <FieldTable fields={fields} />}
      <Text style={note}>{t.note}</Text>
      <Button href={reviewUrl}>{t.button}</Button>
    </Layout>
  );
}

ReviewRequestReminder.PreviewProps = {
  clientName: "Sofia",
  talentName: "Tina Rossi",
  eventTitle: "Lakeside Wedding",
  eventDate: "14 Jun 2026",
  reviewUrl: "https://tulala.digital/review/abc123",
  categoryLabel: "reviews",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
