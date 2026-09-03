import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

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
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };

export type MailFact = { label: string; value: string };

type Props = {
  heading: string;
  intro: string;
  /**
   * Short label/value rows shown under the intro.
   *
   * Support alerts used to be a heading, one sentence and a button — which
   * meant deciding whether to open a ticket required opening the ticket. The
   * facts that drive that decision (who, which workspace, how long it has been
   * waiting) belong in the mail itself.
   */
  facts?: MailFact[];
  ctaUrl: string;
  ctaLabel?: string;
  preview: string;
  footnote?: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
};

/**
 * "Do not reply here, reply there" — in both languages we send.
 *
 * Every support email we send has no Reply-To header, so a reply goes to the
 * From address, which is noreply@tulala.digital. That domain has no MX record,
 * so the reply bounces and nobody ever learns it existed. Even once MX lands,
 * the failure only changes shape: mail arrives in a mailbox nobody watches.
 *
 * People reply to no-reply addresses constantly; the address name is a
 * convention, not a mechanism. The one thing that actually redirects them is
 * saying so, next to the path that works — and every one of these emails
 * already carries that path in its button. So the button gets a caption.
 */
const REPLY_NOTE: Record<string, string> = {
  en: "Replies to this email are not read. Use the button above and your message reaches a person.",
  es: "Las respuestas a este correo no se leen. Usa el botón de arriba y tu mensaje llega a una persona.",
};

export function SupportMail({
  heading,
  intro,
  facts,
  ctaUrl,
  ctaLabel = "Reply in app",
  preview,
  footnote,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <Layout
      preview={preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{heading}</Heading>
      <Text style={body}>{intro}</Text>
      {facts && facts.length > 0 ? (
        <table
          role="presentation"
          cellPadding={0}
          cellSpacing={0}
          style={{
            width: "100%",
            margin: "0 0 20px",
            borderTop: "1px solid #ECEAE4",
            borderCollapse: "collapse",
          }}
        >
          <tbody>
            {facts.map((f) => (
              <tr key={f.label}>
                <td
                  style={{
                    padding: "9px 12px 9px 0",
                    fontSize: "13px",
                    color: "#777777",
                    borderBottom: "1px solid #ECEAE4",
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                    width: "1%",
                  }}
                >
                  {f.label}
                </td>
                <td
                  style={{
                    padding: "9px 0",
                    fontSize: "13px",
                    color: "#1A1A1A",
                    borderBottom: "1px solid #ECEAE4",
                    verticalAlign: "top",
                  }}
                >
                  {f.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <Button href={ctaUrl}>{ctaLabel}</Button>
      <Text style={note}>{REPLY_NOTE[brand?.locale ?? "en"] ?? REPLY_NOTE.en}</Text>
      {footnote ? <Text style={note}>{footnote}</Text> : null}
    </Layout>
  );
}
