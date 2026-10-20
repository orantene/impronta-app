/**
 * TUL-1232: "Your payment receipt" (ES/EN). Sent once per successfully paid
 * subscription invoice (talent and workspace plans). Display only: the amount
 * is whatever Stripe charged, formatted for the email; nothing is computed.
 */
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export type PaymentReceiptEmailInput = {
  locale: "es" | "en";
  /** Amount Stripe collected, in the currency's minor unit. */
  amountCents: number;
  currency: string;
  invoiceNumber: string | null;
  /** Stripe hosted invoice page (receipt view). */
  viewUrl: string;
  /** Stripe PDF, when Stripe generated one. */
  pdfUrl: string | null;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function paymentReceiptSubject(locale: "es" | "en"): string {
  return locale === "es" ? "Tu recibo de pago" : "Your payment receipt";
}

export function formatReceiptAmount(amountCents: number, currency: string, locale: "es" | "en"): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
      style: "currency",
      currency: code,
    }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${code}`;
  }
}

export function renderPaymentReceiptEmail(input: PaymentReceiptEmailInput): string {
  const es = input.locale === "es";
  const title = paymentReceiptSubject(input.locale);
  const amount = formatReceiptAmount(input.amountCents, input.currency, input.locale);
  const body = es
    ? `Gracias. Cobramos ${amount} por tu suscripción de ${PLATFORM_BRAND.name}.`
    : `Thank you. We charged ${amount} for your ${PLATFORM_BRAND.name} subscription.`;
  const number = input.invoiceNumber
    ? `<p style="margin:12px 0 0;color:#6b766f;font-size:13px;">${es ? "Factura" : "Invoice"} ${esc(input.invoiceNumber)}</p>`
    : "";
  const cta = es ? "Ver recibo" : "View receipt";
  const pdf = input.pdfUrl
    ? `<p style="margin:16px 0 0;font-size:13px;"><a href="${esc(input.pdfUrl)}" style="color:#3a4541;">${es ? "Descargar PDF" : "Download PDF"}</a></p>`
    : "";
  return `<!doctype html>
<html lang="${input.locale}"><body style="margin:0;padding:32px 16px;background:#f1ede3;font-family:Inter,system-ui,sans-serif;color:#0f1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffdf7;border-radius:20px;border:1px solid rgba(15,23,20,0.08);">
    <tr><td style="padding:40px;">
      <h1 style="font-size:26px;line-height:1.2;font-weight:500;margin:0;">${esc(title)}</h1>
      <p style="margin:20px 0 0;color:#3a4541;font-size:15px;line-height:1.6;">${esc(body)}</p>
      ${number}
      <p style="margin:28px 0 0;"><a href="${esc(input.viewUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#0f1714;color:#fffdf7;font-size:14px;font-weight:600;text-decoration:none;">${esc(cta)}</a></p>
      ${pdf}
    </td></tr>
  </table>
</body></html>`;
}
