import { Heading, Section, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

/**
 * Digest email — one summary message standing in for N batched notifications.
 *
 * The digest cron (`/api/cron/send-digest-emails`) collapses every queued
 * `payload.digest = true` row for a `(recipient, category)` pair into a single
 * send of this template (spec §7). Each `item` is one collapsed notification.
 */

export interface DigestItem {
  /** One-line human summary of the underlying notification. */
  summary: string;
  /** Optional short timestamp label, e.g. "14:32 UTC". */
  timeLabel?: string | null;
}

interface Props {
  recipientName: string | null;
  /** Headline + subject, e.g. "You have 5 new messages". */
  heading: string;
  /** Sentence that follows "Hi {name}, ". */
  intro: string;
  items: DigestItem[];
  ctaUrl: string;
  ctaLabel: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function Digest({
  recipientName,
  heading,
  intro,
  items,
  ctaUrl,
  ctaLabel,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = recipientName ?? "there";

  return (
    <Layout
      preview={heading}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{heading}</Heading>
      <Text style={body}>
        Hi {name}, {intro}
      </Text>
      <Section style={list}>
        {items.map((it, i) => (
          <Text key={i} style={item}>
            {it.summary}
            {it.timeLabel ? <span style={time}>{` · ${it.timeLabel}`}</span> : null}
          </Text>
        ))}
      </Section>
      <Button href={ctaUrl}>{ctaLabel}</Button>
    </Layout>
  );
}

Digest.PreviewProps = {
  recipientName: "Marco Bianchi",
  heading: "You have 3 new messages",
  intro: "here's a summary of your recent messages:",
  items: [
    { summary: "Giulia replied on the Lake Como editorial", timeLabel: "14:32 UTC" },
    { summary: "New message from the Milan agency", timeLabel: "15:01 UTC" },
    { summary: "Coordinator left a note on your inquiry", timeLabel: "16:20 UTC" },
  ],
  ctaUrl: "https://tulala.digital",
  ctaLabel: "Open Tulala →",
  categoryLabel: "messages",
} satisfies Props;

const h2: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "20px",
  fontWeight: 700,
  color: "#1a1a1a",
};
const body: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: "15px",
  color: "#444444",
  lineHeight: 1.6,
};
const list: React.CSSProperties = {
  margin: "0 0 8px",
  paddingLeft: "0",
  borderTop: "1px solid #eeeeee",
};
const item: React.CSSProperties = {
  margin: "0",
  padding: "10px 0",
  fontSize: "14px",
  color: "#333333",
  lineHeight: 1.5,
  borderBottom: "1px solid #eeeeee",
};
const time: React.CSSProperties = {
  color: "#999999",
  fontSize: "12px",
};
