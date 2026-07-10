import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";
import { getEmailCopy, interpolate } from "@/lib/notifications/email-copy";

/**
 * ReplyReady — "the agency replied about your inquiry" (wave W2-F, decision D7).
 *
 * Sent to a guest when a coordinator answers in their private thread and they
 * aren't actively watching the popup. Deliberately PREVIEW-FREE (no message
 * body): the CTA opens the conversation at /c/{inquiryId}, where the reply is
 * read in context. EN/ES off `brand.locale`, per the notification convention.
 */
interface Props {
  contactName: string | null;
  agencyName: string;
  threadUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function ReplyReady({
  contactName,
  agencyName,
  threadUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const name = contactName ?? "there";
  const t = getEmailCopy(brand?.locale)["client.reply_ready"];

  return (
    <Layout
      preview={t.preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{t.heading}</Heading>
      <Text style={body}>{interpolate(t.intro, { name, brand: agencyName })}</Text>
      <Text style={note}>{t.note}</Text>
      <Button href={threadUrl}>{t.button}</Button>
    </Layout>
  );
}

ReplyReady.PreviewProps = {
  contactName: "Marco Bianchi",
  agencyName: "Impronta Models",
  threadUrl: "https://tulala.digital/c/abc123",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
