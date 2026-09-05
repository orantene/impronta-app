import * as React from "react";
import { SupportMail } from "./_shared";
import { SUPPORT_AGENT } from "@/lib/support/support-persona";
import type { EmailBrand } from "../components/Layout";

interface Props {
  ticketNumber: number;
  subject: string;
  replyUrl: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

/**
 * The receipt a person gets for writing to us.
 *
 * Somebody who filled in the contact form on tulala.digital received NOTHING.
 * The ticket was created, five notifications went to the owner, and the sender
 * got no acknowledgement at all — verified against production, where no
 * dispatch row has ever existed for a contact-form address. Their entire
 * experience of "A real person answers", which is the headline directly above
 * that form, was the word "Sending…" and then silence.
 *
 * The confirmation the chat panel sends was no better: it reused AgentReply,
 * so it opened with "<agent> replied" and "There is a new reply on your
 * ticket" when nobody had replied to anything. A false receipt is worse than
 * none, because the reader goes looking for a reply that does not exist.
 *
 * This says the true thing: we have it, it has a number, a person answers it,
 * and here is where the conversation lives. It promises no response time —
 * support is one part-time responder, and /support commits in its own words to
 * not publishing a time we cannot keep.
 */
export default function MessageReceived({
  ticketNumber,
  subject,
  replyUrl,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const locale = brand?.locale === "es" ? "es" : "en";
  const t =
    locale === "es"
      ? {
          heading: "Tenemos tu mensaje",
          intro: `Lo hemos recibido y le hemos puesto el número ${ticketNumber}. ${SUPPORT_AGENT.name} lo lee y te responde por aquí.`,
          about: "Sobre",
          cta: "Ver la conversación",
          note: "Puedes responder a este correo o seguir escribiendo en la conversación.",
        }
      : {
          heading: "We have your message",
          intro: `It reached us and it is ticket #${ticketNumber}. ${SUPPORT_AGENT.name} reads these and will answer you here.`,
          about: "About",
          cta: "See the conversation",
          note: "You can keep writing in the conversation at any time.",
        };

  return (
    <SupportMail
      preview={`${t.heading} [Tulala #${ticketNumber}]`}
      heading={t.heading}
      intro={t.intro}
      facts={subject ? [{ label: t.about, value: subject }] : undefined}
      ctaUrl={replyUrl}
      ctaLabel={t.cta}
      footnote={t.note}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

MessageReceived.PreviewProps = {
  ticketNumber: 143,
  subject: "Can I take deposits for classes?",
  replyUrl: "https://tulala.digital/c/preview",
  categoryLabel: "messages",
} satisfies Props;
