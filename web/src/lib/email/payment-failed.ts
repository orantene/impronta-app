/**
 * TUL-835: "Your payment didn't go through" (ES/EN). Sent once per failed
 * invoice, to the billing contact, with a link that lets them fix the card.
 */
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export type PaymentFailedEmailInput = {
  locale: "es" | "en";
  /** Where the customer fixes the card (Stripe hosted invoice or billing page). */
  actionUrl: string;
  graceDays: number;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function paymentFailedSubject(locale: "es" | "en"): string {
  return locale === "es" ? "Tu pago no pasó" : "Your payment didn't go through";
}

export function renderPaymentFailedEmail(input: PaymentFailedEmailInput): string {
  const es = input.locale === "es";
  const title = paymentFailedSubject(input.locale);
  const body = es
    ? `No pudimos cobrar tu suscripción de ${PLATFORM_BRAND.name}. Tu plan sigue activo durante ${input.graceDays} días mientras reintentamos. Actualiza tu tarjeta para no perder funciones.`
    : `We couldn't charge your ${PLATFORM_BRAND.name} subscription. Your plan stays active for ${input.graceDays} days while we retry. Update your card to keep your features.`;
  const cta = es ? "Actualizar tarjeta" : "Update your card";
  const foot = es ? "Tu contenido no se borra." : "Your content is never deleted.";
  return `<!doctype html>
<html lang="${input.locale}"><body style="margin:0;padding:32px 16px;background:#f1ede3;font-family:Inter,system-ui,sans-serif;color:#0f1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffdf7;border-radius:20px;border:1px solid rgba(15,23,20,0.08);">
    <tr><td style="padding:40px;">
      <h1 style="font-size:26px;line-height:1.2;font-weight:500;margin:0;">${esc(title)}</h1>
      <p style="margin:20px 0 0;color:#3a4541;font-size:15px;line-height:1.6;">${esc(body)}</p>
      <p style="margin:28px 0 0;"><a href="${esc(input.actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#b3261e;color:#fffdf7;font-size:14px;font-weight:600;text-decoration:none;">${esc(cta)}</a></p>
      <p style="margin:28px 0 0;color:#6b766f;font-size:13px;line-height:1.6;">${esc(foot)}</p>
    </td></tr>
  </table>
</body></html>`;
}
