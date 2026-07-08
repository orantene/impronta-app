import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { FieldTable } from "../components/FieldTable";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

/**
 * Review-request invite (STANDING v2, spec §Phase 2) — a past client is asked to
 * leave a review for a talent they booked. Dispatched by the
 * `createReviewRequestAction` producer once the `review_requests` row is stored.
 *
 * Neutral, no-incentive copy by design (FTC): the invite is a nudge to share
 * honest feedback, never an offer of anything in return. The CTA points at the
 * single-use `/review/{token}` landing page (owned by the review-token route).
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

export default function ReviewRequestInvite({
  clientName,
  talentName,
  eventTitle,
  eventDate,
  reviewUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const t = getEmailCopy(brand?.locale)["review.request_invite"];
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

ReviewRequestInvite.PreviewProps = {
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
