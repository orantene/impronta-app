import "server-only";

import { PLATFORM_BRAND } from "@/lib/platform/brand";
import type { SubscribeLocale } from "./types";

/**
 * Welcome email for a new newsletter subscriber, EN/ES by locale.
 *
 * Deliberately plain HTML with inline styles rather than the transactional
 * React Email Layout: this is platform marketing mail (no tenant brand to
 * resolve), and a small self-contained template keeps the render path simple
 * and dependency-free. Sent via the existing `sendEmail` Resend wrapper.
 *
 * No fabricated claims, no subscriber counts. One promise, one link to the best
 * existing guide, one honoured unsubscribe.
 */

const BOOKING_DEPOSITS_PATH = "/resources/booking-deposits";

type WelcomeCopy = {
  subject: string;
  preheader: string;
  heading: string;
  intro: string;
  promise: string;
  guideLead: string;
  guideCta: string;
  signoff: string;
  unsubscribePrefix: string;
  unsubscribeLink: string;
};

function copyFor(locale: SubscribeLocale): WelcomeCopy {
  if (locale === "es") {
    return {
      subject: "Estás dentro. Una guía práctica cada semana.",
      preheader: "Empecemos con cómo cobrar anticipos que sí funcionan.",
      heading: "Bienvenido",
      intro:
        "Gracias por suscribirte. Cada semana te mando una guía corta y práctica sobre cómo te contratan y cómo cobras. Nada de relleno.",
      promise: "Una guía útil por semana. Puedes salirte cuando quieras.",
      guideLead:
        "Para empezar, esta es la que más le cambia el negocio a la gente: qué anticipo cobrar y por qué funciona.",
      guideCta: "Leer la guía de anticipos",
      signoff: "Nos leemos pronto,\nEl equipo de Tulala",
      unsubscribePrefix: "¿Ya no quieres estos correos? ",
      unsubscribeLink: "Darte de baja",
    };
  }
  return {
    subject: "You're in. One practical guide a week.",
    preheader: "Let's start with deposits that actually work.",
    heading: "Welcome",
    intro:
      "Thanks for signing up. Every week I send one short, practical guide on getting booked and getting paid. No filler.",
    promise: "One useful guide a week. Leave whenever you want.",
    guideLead:
      "To start, here is the one that changes the business most for people: what deposit to charge and why it works.",
    guideCta: "Read the deposits guide",
    signoff: "Talk soon,\nThe Tulala team",
    unsubscribePrefix: "Don't want these emails? ",
    unsubscribeLink: "Unsubscribe",
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildWelcomeEmail(input: {
  locale: SubscribeLocale;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const c = copyFor(input.locale);
  const base = `https://${PLATFORM_BRAND.domain}`;
  const guideUrl =
    input.locale === "es"
      ? `${base}/es${BOOKING_DEPOSITS_PATH}`
      : `${base}${BOOKING_DEPOSITS_PATH}`;

  const signoffHtml = escapeHtml(c.signoff).replace(/\n/g, "<br />");

  const html = `<!doctype html>
<html lang="${input.locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(c.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f6f4;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(c.preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e7e3;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:-0.01em;color:#1a1a17;">${escapeHtml(PLATFORM_BRAND.name)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;">
                <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:#1a1a17;">${escapeHtml(c.heading)}</h1>
                <p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#3a3a35;">${escapeHtml(c.intro)}</p>
                <p style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#3a3a35;">${escapeHtml(c.guideLead)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <a href="${escapeHtml(guideUrl)}" style="display:inline-block;background:#1a1a17;color:#ffffff;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">${escapeHtml(c.guideCta)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <p style="margin:0 0 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#6b6b63;">${escapeHtml(c.promise)}</p>
                <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#3a3a35;">${signoffHtml}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;border-top:1px solid #eeeeea;">
                <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#9a9a92;">${escapeHtml(c.unsubscribePrefix)}<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#6b6b63;text-decoration:underline;">${escapeHtml(c.unsubscribeLink)}</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: c.subject, html };
}
