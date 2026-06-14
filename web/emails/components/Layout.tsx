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
}

const DEFAULTS = {
  wordmark: "TULALA",
  accountName: "Tulala",
  footerDomain: "tulala.digital",
  homeHref: "https://tulala.digital",
  locale: "en",
};

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
              You received this because you have an account with {b.accountName}.{" "}
              <Link href={b.homeHref} style={footerLink}>
                {b.footerDomain}
              </Link>
            </Text>
            <UnsubscribeFooter unsubscribeUrl={unsubscribeUrl} categoryLabel={categoryLabel} />
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
