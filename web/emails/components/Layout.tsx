import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import { UnsubscribeFooter } from "./UnsubscribeFooter";

export interface EmailBrand {
  wordmark?: string;
  accountName?: string;
  footerDomain?: string;
  homeHref?: string;
  /** BCP-47 short code ("en" | "es") — drives <Html lang> + bilingual copy. */
  locale?: string;
  /**
   * Does the person receiving this actually have an account?
   *
   * The footer stated flatly that they did. It is hardcoded into this layout,
   * so it also went to people with no account at all: guest support visitors,
   * contact-form senders, invitees. They were told they had an account they
   * never made — and they are precisely the readers most likely to answer that
   * by pressing "report spam", because from where they sit the sentence looks
   * like evidence that something signed them up without asking.
   *
   * The email channel knows the answer: it already branches on
   * `recipient.userId` to choose between an account unsubscribe token and a
   * guest one. Defaults to true so an unset value keeps the old wording rather
   * than silently telling account holders they are strangers.
   */
  recipientHasAccount?: boolean;
}

const DEFAULTS = {
  wordmark: "TULALA",
  accountName: "Tulala",
  footerDomain: "tulala.digital",
  homeHref: "https://tulala.digital",
  locale: "en",
  recipientHasAccount: true,
};

/**
 * Why this email reached you, in the reader's own language.
 *
 * Fifty-one templates are written in English and Spanish, and then this line —
 * and the unsubscribe link under it — were hardcoded English, so a Spanish
 * email stopped being Spanish exactly where the reader needs it most: the
 * sentence explaining why they got it and the link to stop getting it.
 */
function footerReason(locale: string, hasAccount: boolean, accountName: string): string {
  if (locale === "es") {
    return hasAccount
      ? `Recibes esto porque tienes una cuenta en ${accountName}.`
      : `Recibes esto porque esta dirección se usó para escribir a ${accountName}.`;
  }
  return hasAccount
    ? `You received this because you have an account with ${accountName}.`
    : `You received this because this address was used to contact ${accountName}.`;
}

interface LayoutProps {
  preview: string;
  brand?: EmailBrand;
  /** One-click unsubscribe URL injected by the email channel (non-required categories). */
  unsubscribeUrl?: string;
  /** Human category label shown next to the unsubscribe link. */
  categoryLabel?: string;
  children: React.ReactNode;
}

export function Layout({ preview, brand, unsubscribeUrl, categoryLabel, children }: LayoutProps) {
  const b = { ...DEFAULTS, ...brand };

  return (
    <Html lang={b.locale ?? "en"}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Wordmark */}
          <Section style={header}>
            <Link href={b.homeHref} style={wordmark}>
              {b.wordmark}
            </Link>
          </Section>

          {/* Card */}
          <Section style={card}>{children}</Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              {footerReason(b.locale ?? "en", b.recipientHasAccount !== false, b.accountName)}{" "}
              <Link href={b.homeHref} style={footerLink}>
                {b.footerDomain}
              </Link>
            </Text>
            <UnsubscribeFooter
              unsubscribeUrl={unsubscribeUrl}
              categoryLabel={categoryLabel}
              locale={b.locale ?? "en"}
            />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  margin: 0,
  padding: 0,
  backgroundColor: "#f9f9f9",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  color: "#1a1a1a",
};

const container: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "40px 16px",
};

const header: React.CSSProperties = {
  paddingBottom: "24px",
  textAlign: "center",
};

const wordmark: React.CSSProperties = {
  fontFamily: "Georgia, serif",
  fontSize: "18px",
  letterSpacing: "0.2em",
  color: "#1a1a1a",
  textDecoration: "none",
  fontWeight: 600,
};

const card: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  border: "1px solid #e5e5e5",
  padding: "32px 32px 28px",
};

const footer: React.CSSProperties = {
  paddingTop: "20px",
  textAlign: "center",
};

const footerText: React.CSSProperties = {
  fontSize: "12px",
  color: "#888888",
  margin: 0,
};

const footerLink: React.CSSProperties = {
  color: "#888888",
};
