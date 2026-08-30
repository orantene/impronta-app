import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  maskEmail,
  parseUnsubscribeCategory,
  resolveUnsubscribeRecipient,
  type UnsubscribeCategoryInfo,
} from "@/lib/notifications/unsubscribe";

import { confirmUnsubscribeAction } from "./actions";

/**
 * One-click unsubscribe landing page (spec §8, Phase 6).
 *
 * Reached from the footer of any non-required email. The flow is two-step on
 * purpose: GET renders a confirm card (a read, so an email scanner prefetch
 * can't unsubscribe anyone), and only the explicit POST mutates prefs +
 * rotates the token. After the POST the page re-renders in a terminal
 * `?status=…` state, so it never re-resolves the now-rotated token.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;
type Search = Promise<{ cat?: string; status?: string }>;

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { token } = await params;
  const { cat, status } = await searchParams;
  const info = parseUnsubscribeCategory(cat);

  // Terminal states after a POST — the token has been rotated, so never try
  // to re-resolve it here; render purely from the status + category label.
  if (status) {
    return <Shell>{terminalCard(status, info)}</Shell>;
  }

  // Bad / missing category, or a required one — decide without any DB work.
  if (!info) {
    return <Shell>{terminalCard("invalid_category", null)}</Shell>;
  }
  if (info.required) {
    return <Shell>{terminalCard("required_category", info)}</Shell>;
  }

  // Resolve the token for the confirm screen (read-only).
  const admin = createServiceRoleClient();
  const recipient = admin ? await resolveUnsubscribeRecipient(admin, token) : null;
  if (!recipient) {
    return <Shell>{terminalCard("invalid_token", info)}</Shell>;
  }

  const masked = maskEmail(recipient.email);
  const label = info.label.toLowerCase();
  const isGuest = recipient.userId === null;
  const confirmBody = isGuest
    ? masked
      ? `We'll stop sending support emails to ${masked}. This does not affect emails about an account you create later.`
      : `We'll stop sending support emails to this address. This does not affect emails about an account you create later.`
    : masked
      ? `We'll stop sending ${label} emails to ${masked}. You can turn them back on any time from your notification settings.`
      : `We'll stop sending ${label} emails. You can turn them back on any time from your notification settings.`;

  return (
    <Shell>
      <Card
        tone="neutral"
        glyph="✉"
        title={`Unsubscribe from ${label}?`}
        body={confirmBody}
      >
        <form action={confirmUnsubscribeAction} style={{ width: "100%" }}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="cat" value={info.category} />
          <button type="submit" style={primaryBtn}>
            Unsubscribe
          </button>
        </form>
        <Link href="/" style={secondaryLink}>
          Keep my subscription
        </Link>
      </Card>
    </Shell>
  );
}

// ─── Terminal-state copy ────────────────────────────────────────────────────

type Tone = "success" | "warn" | "neutral";

function terminalCard(status: string, info: UnsubscribeCategoryInfo | null): ReactNode {
  const label = info?.label.toLowerCase() ?? "these";

  switch (status) {
    case "done":
      return (
        <Card
          tone="success"
          glyph="✓"
          title="You've been unsubscribed"
          body={`You won't receive ${label} emails anymore. You can turn them back on any time from your notification settings.`}
        >
          <BackHome />
        </Card>
      );
    case "required_category":
      return (
        <Card
          tone="neutral"
          glyph="🔒"
          title={`${info?.label ?? "These"} emails can't be turned off`}
          body="These are essential to your account — sign-in links, receipts and the like — so they're always on."
        >
          <BackHome />
        </Card>
      );
    case "invalid_token":
      return (
        <Card
          tone="neutral"
          glyph="↻"
          title="This link has expired"
          body="It may have already been used — unsubscribe links work once. You can manage everything from your notification settings instead."
        >
          <BackHome />
        </Card>
      );
    case "invalid_category":
      return (
        <Card
          tone="warn"
          glyph="!"
          title="This link looks incomplete"
          body="We couldn't tell which emails to unsubscribe you from. Try the link from your most recent email, or update your notification settings directly."
        >
          <BackHome />
        </Card>
      );
    default: // write_failed and anything unexpected
      return (
        <Card
          tone="warn"
          glyph="!"
          title="Something went wrong"
          body="We couldn't update your preferences just now. Please try the link again in a moment, or manage them from your notification settings."
        >
          <BackHome />
        </Card>
      );
  }
}

// ─── Presentational pieces ──────────────────────────────────────────────────

function Shell({ children }: { children: ReactNode }) {
  return (
    <main style={shell}>
      <div style={wordmark}>{PLATFORM_BRAND.name}</div>
      {children}
      <p style={footerNote}>{PLATFORM_BRAND.name} · notification preferences</p>
    </main>
  );
}

function Card({
  tone,
  glyph,
  title,
  body,
  children,
}: {
  tone: Tone;
  glyph: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section style={card}>
      <div style={{ ...glyphCircle, ...TONE_STYLES[tone] }}>{glyph}</div>
      <h1 style={heading}>{title}</h1>
      <p style={bodyText}>{body}</p>
      <div style={actions}>{children}</div>
    </section>
  );
}

function BackHome() {
  return (
    <Link href="/" style={primaryBtn}>
      Back to {PLATFORM_BRAND.name}
    </Link>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const FONT = '"Inter", system-ui, sans-serif';

const TONE_STYLES: Record<Tone, CSSProperties> = {
  success: { background: "rgba(46,125,91,0.14)", color: "#1F5C40" },
  warn: { background: "rgba(180,83,9,0.12)", color: "#9A3412" },
  neutral: { background: "rgba(11,11,13,0.06)", color: "rgba(11,11,13,0.7)" },
};

const shell: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 20,
  padding: 24,
  background: "#FAFAF8",
  fontFamily: FONT,
  color: "#0B0B0D",
};

const wordmark: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: -0.2,
  color: "rgba(11,11,13,0.55)",
};

const card: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "#fff",
  borderRadius: 18,
  border: "1px solid rgba(24,24,27,0.10)",
  boxShadow: "0 1px 2px rgba(11,11,13,0.04), 0 12px 32px rgba(11,11,13,0.06)",
  padding: "32px 28px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  gap: 14,
};

const glyphCircle: CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 24,
  fontWeight: 700,
};

const heading: CSSProperties = {
  fontSize: 20,
  fontWeight: 600,
  margin: 0,
  lineHeight: 1.3,
};

const bodyText: CSSProperties = {
  fontSize: 14,
  color: "rgba(11,11,13,0.62)",
  lineHeight: 1.6,
  margin: 0,
  maxWidth: 360,
};

const actions: CSSProperties = {
  marginTop: 8,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};

const primaryBtn: CSSProperties = {
  width: "100%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "11px 16px",
  borderRadius: 999,
  background: "#0B0B0D",
  color: "#fff",
  border: "none",
  fontSize: 13.5,
  fontWeight: 600,
  fontFamily: FONT,
  textDecoration: "none",
  cursor: "pointer",
};

const secondaryLink: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "rgba(11,11,13,0.5)",
  textDecoration: "none",
};

const footerNote: CSSProperties = {
  fontSize: 11.5,
  color: "rgba(11,11,13,0.38)",
  margin: 0,
};
