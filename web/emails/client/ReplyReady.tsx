import { Heading, Link, Section, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

/**
 * ReplyReady — a staff reply mirrored to the inquirer's inbox (wave W2-F,
 * decision D7; inquiry email loop 2026-08-20).
 *
 * Sent when a coordinator answers in the inquirer's private thread and they
 * aren't watching it live. Support-desk style: the email carries the ACTUAL
 * reply text (`replyText`) in a quoted block, then one CTA:
 *   - `signsIn` true  → "Log in to continue the conversation" — a click-time
 *     magic-link exchange that opens THE conversation signed in.
 *   - `signsIn` false → "Read the reply" — the cookie-proven guest window at
 *     /c/{inquiryId} (no client account to sign into).
 * Below the CTA, a per-conversation "stop email notifications" link
 * (`muteUrl`), independent of the category unsubscribe in the footer.
 * EN/ES off `brand.locale`, per the notification convention.
 */
interface Props {
  contactName: string | null;
  agencyName: string;
  threadUrl: string;
  /** The staff reply's text, mirrored verbatim (pre-truncated upstream). */
  replyText?: string | null;
  /** True when threadUrl signs the recipient in (magic-link exchange CTA). */
  signsIn?: boolean;
  /** Per-conversation mute link; omitted when the signing secret is unset. */
  muteUrl?: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function ReplyReady({
  contactName,
  agencyName,
  threadUrl,
  replyText,
  signsIn,
  muteUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = contactName ?? "there";
  const t = getEmailCopy(brand?.locale)["client.reply_ready"];
  const reply = (replyText ?? "").trim();

  return (
    <Layout
      preview={reply ? reply.slice(0, 120) : t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, brand: agencyName })}</Text>
      {reply ? (
        <Section style={quoteBox}>
          {reply.split(/\n+/).map((line, i) => (
            <Text key={i} style={quoteText}>
              {line}
            </Text>
          ))}
        </Section>
      ) : null}
      <Text style={note}>{signsIn ? t.loginNote : t.note}</Text>
      <Button href={threadUrl}>{signsIn ? t.loginButton : t.button}</Button>
      {muteUrl ? (
        <Text style={muteLine}>
          <Link href={muteUrl} style={muteLink}>
            {t.stopLine}
          </Link>
        </Text>
      ) : null}
    </Layout>
  );
}

ReplyReady.PreviewProps = {
  contactName: "Marco Bianchi",
  agencyName: "Impronta Models",
  threadUrl: "https://tulala.digital/c/abc123",
  replyText:
    "Hi Marco, thanks for reaching out! We have space that evening. Could you confirm how many people and what time?",
  signsIn: true,
  muteUrl: "https://tulala.digital/unsubscribe/conversation?token=demo",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0 0 4px", fontSize: "13px", color: "#777777" };
const quoteBox: React.CSSProperties = {
  margin: "0 0 16px",
  padding: "14px 16px",
  background: "#f6f6f4",
  borderLeft: "3px solid #d4d4d0",
  borderRadius: "0 8px 8px 0",
};
const quoteText: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "15px",
  color: "#333333",
  lineHeight: 1.6,
};
const muteLine: React.CSSProperties = { margin: "14px 0 0", fontSize: "12px" };
const muteLink: React.CSSProperties = { color: "#888888", textDecoration: "underline" };
