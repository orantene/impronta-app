import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { PLATFORM_BRAND } from "@/lib/platform/brand";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { maskEmail } from "@/lib/notifications/unsubscribe";
import { verifyConversationToken } from "@/lib/inquiry/conversation-email-tokens";

import { confirmConversationMuteAction } from "./actions";

/**
 * Per-conversation email-mirror mute page (inquiry email loop, 2026-08-20).
 *
 * Reached from the "stop email notifications for this conversation" link in a
 * reply-mirror email. Same two-step contract as `/unsubscribe/[token]`: GET
 * renders a confirm card (a read, so an email scanner prefetch can't mute
 * anything), and only the explicit POST stamps
 * `inquiries.email_mirror_muted_at`. The token is HMAC-signed and
 * conversation-scoped (see conversation-email-tokens.ts); it deliberately has
 * no expiry — an unsubscribe must always be honorable.
 *
 * Visitor-facing → EN + ES, keyed off the `lang` param the email link carries
 * (the tenant's email locale).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

type Search = Promise<{ token?: string; lang?: string; status?: string }>;

type Lang = "en" | "es";

const COPY: Record<Lang, {
  confirmTitle: string;
  confirmBodyWithEmail: (masked: string) => string;
  confirmBody: string;
  confirmButton: string;
  keepLink: string;
  doneTitle: string;
  doneBody: string;
  invalidTitle: string;
  invalidBody: string;
  errorTitle: string;
  errorBody: string;
  backHome: string;
  footer: string;
}> = {
  en: {
    confirmTitle: "Stop emails for this conversation?",
    confirmBodyWithEmail: (masked) =>
      `We'll stop emailing ${masked} when the agency replies in this conversation. You can still read every reply by opening the conversation from the link in any earlier email.`,
    confirmBody:
      "We'll stop emailing you when the agency replies in this conversation. You can still read every reply by opening the conversation itself.",
    confirmButton: "Stop email notifications",
    keepLink: "Keep receiving emails",
    doneTitle: "Email notifications are off",
    doneBody:
      "You won't get emails for this conversation anymore. Replies still arrive in the conversation itself.",
    invalidTitle: "This link isn't valid",
    invalidBody:
      "The link may be incomplete. Try the link from your most recent email about this conversation.",
    errorTitle: "Something went wrong",
    errorBody:
      "We couldn't update this conversation just now. Please try the link again in a moment.",
    backHome: `Back to ${PLATFORM_BRAND.name}`,
    footer: `${PLATFORM_BRAND.name} · notification preferences`,
  },
  es: {
    confirmTitle: "¿Dejar de recibir correos de esta conversación?",
    confirmBodyWithEmail: (masked) =>
      `Dejaremos de enviar correos a ${masked} cuando la agencia responda en esta conversación. Podrás seguir leyendo cada respuesta abriendo la conversación desde el enlace de cualquier correo anterior.`,
    confirmBody:
      "Dejaremos de enviarte correos cuando la agencia responda en esta conversación. Podrás seguir leyendo cada respuesta abriendo la conversación.",
    confirmButton: "Dejar de recibir correos",
    keepLink: "Seguir recibiendo correos",
    doneTitle: "Correos desactivados",
    doneBody:
      "Ya no recibirás correos de esta conversación. Las respuestas siguen llegando a la conversación.",
    invalidTitle: "Este enlace no es válido",
    invalidBody:
      "Puede que el enlace esté incompleto. Prueba con el enlace de tu correo más reciente sobre esta conversación.",
    errorTitle: "Algo salió mal",
    errorBody:
      "No pudimos actualizar esta conversación en este momento. Vuelve a intentarlo con el enlace en un momento.",
    backHome: `Volver a ${PLATFORM_BRAND.name}`,
    footer: `${PLATFORM_BRAND.name} · preferencias de notificaciones`,
  },
};

export default async function UnsubscribeConversationPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { token, lang: rawLang, status } = await searchParams;
  const lang: Lang = rawLang === "es" ? "es" : "en";
  const t = COPY[lang];

  // Terminal states after the POST — render purely from the status.
  if (status === "done") {
    return (
      <Shell footer={t.footer}>
        <Card tone="success" glyph="✓" title={t.doneTitle} body={t.doneBody}>
          <BackHome label={t.backHome} />
        </Card>
      </Shell>
    );
  }
  if (status === "invalid_token") {
    return (
      <Shell footer={t.footer}>
        <Card tone="neutral" glyph="↻" title={t.invalidTitle} body={t.invalidBody}>
          <BackHome label={t.backHome} />
        </Card>
      </Shell>
    );
  }
  if (status) {
    return (
      <Shell footer={t.footer}>
        <Card tone="warn" glyph="!" title={t.errorTitle} body={t.errorBody}>
          <BackHome label={t.backHome} />
        </Card>
      </Shell>
    );
  }

  // Confirm screen: verify the token (read-only — no mutation on GET).
  const verified = verifyConversationToken(token, "mute", null);
  if (!verified.ok) {
    return (
      <Shell footer={t.footer}>
        <Card tone="neutral" glyph="↻" title={t.invalidTitle} body={t.invalidBody}>
          <BackHome label={t.backHome} />
        </Card>
      </Shell>
    );
  }

  // Display-only: mask the address we'd stop mailing. Never block on it.
  let masked: string | null = null;
  const admin = createServiceRoleClient();
  if (admin) {
    const { data } = await admin
      .from("inquiries")
      .select("contact_email")
      .eq("id", verified.inquiryId)
      .maybeSingle();
    masked = maskEmail((data as { contact_email?: string | null } | null)?.contact_email);
  }

  return (
    <Shell footer={t.footer}>
      <Card
        tone="neutral"
        glyph="✉"
        title={t.confirmTitle}
        body={masked ? t.confirmBodyWithEmail(masked) : t.confirmBody}
      >
        <form action={confirmConversationMuteAction} style={{ width: "100%" }}>
          <input type="hidden" name="token" value={token ?? ""} />
          <input type="hidden" name="lang" value={lang} />
          <button type="submit" style={primaryBtn}>
            {t.confirmButton}
          </button>
        </form>
        <Link href="/" style={secondaryLink}>
          {t.keepLink}
        </Link>
      </Card>
    </Shell>
  );
}

// ─── Presentational pieces (mirrors /unsubscribe/[token]) ───────────────────

type Tone = "success" | "warn" | "neutral";

function Shell({ children, footer }: { children: ReactNode; footer: string }) {
  return (
    <main style={shell}>
      <div style={wordmark}>{PLATFORM_BRAND.name}</div>
      {children}
      <p style={footerNote}>{footer}</p>
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

function BackHome({ label }: { label: string }) {
  return (
    <Link href="/" style={primaryBtn}>
      {label}
    </Link>
  );
}

// ─── Styles (identical to /unsubscribe/[token]) ─────────────────────────────

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
