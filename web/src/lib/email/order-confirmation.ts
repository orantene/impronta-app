import { formatOrderMoney } from "@/lib/orders/money-format";

/**
 * The order confirmation email. Pure: builds a subject and an HTML body.
 *
 * THREE THINGS IT IS CAREFUL ABOUT, each because getting it wrong is silent.
 *
 * 1. IT DOES NOT SAY "PAID" UNLESS MONEY ARRIVED. For a peso tenant this is the
 *    normal case, not a degraded one: Stripe does not operate in Argentina, so
 *    El Paisa's customers pay in person. An email that thanks someone for a
 *    payment they have not made is worse than no email.
 *
 * 2. MONEY GOES THROUGH `formatOrderMoney`. Four surfaces had four formats and
 *    one of them showed pesos wearing a dollar sign. An email cannot be
 *    corrected after sending, so it is the last place to invent a fifth.
 *
 * 3. THE NOUN COMES FROM THE TENANT. A restaurant says "pedido", not "order",
 *    and the words table already carries it. Passing it in rather than
 *    hardcoding is the same rule the order card follows.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type OrderEmailLocale = "en" | "es";

export type OrderEmailLine = {
  label: string;
  units: number;
  totalCents: number;
};

export type OrderConfirmationInput = {
  locale: OrderEmailLocale;
  /** The tenant's own word for an order. Falls back per locale when absent. */
  noun?: string | null;
  tenantName: string;
  customerName?: string | null;
  currency: string;
  totalCents: number;
  lines: readonly OrderEmailLine[];
  /** Money that has actually arrived. Decides "paid" vs "to pay". */
  collectedCents: number;
  /** `/r/<receipt_code>` — never the order id, which is internal. */
  receiptUrl?: string | null;
};

const COPY = {
  en: {
    nounFallback: "order",
    confirmedKicker: "Order received",
    greeting: (name: string) => `Thank you, ${name}.`,
    greetingAnon: "Thank you.",
    receivedBy: (t: string) => `${t} has your order.`,
    paidLine: "Paid in full.",
    payInPersonLine: "Please pay when you collect.",
    outstandingLabel: "Still to pay",
    totalLabel: "Total",
    viewReceipt: "View your receipt",
    itemsHeading: "What you ordered",
  },
  es: {
    nounFallback: "pedido",
    confirmedKicker: "Pedido recibido",
    greeting: (name: string) => `Gracias, ${name}.`,
    greetingAnon: "Gracias.",
    receivedBy: (t: string) => `${t} ya tiene tu pedido.`,
    paidLine: "Pagado por completo.",
    payInPersonLine: "Puedes pagar al recoger.",
    outstandingLabel: "Falta pagar",
    totalLabel: "Total",
    viewReceipt: "Ver tu recibo",
    itemsHeading: "Lo que pediste",
  },
} as const;

export function orderConfirmationSubject(input: OrderConfirmationInput): string {
  const c = COPY[input.locale];
  const noun = input.noun?.trim() || c.nounFallback;
  // The tenant's name first: this lands in an inbox beside a hundred others and
  // "El Paisa" is what a person scans for, not "Order confirmation".
  return `${input.tenantName}: ${noun}`;
}

export function renderOrderConfirmationEmail(input: OrderConfirmationInput): string {
  const c = COPY[input.locale];
  const noun = input.noun?.trim() || c.nounFallback;
  const outstanding = Math.max(0, input.totalCents - input.collectedCents);
  const isPaid = outstanding === 0 && input.totalCents > 0;

  const name = input.customerName?.trim();
  const greeting = name ? c.greeting(escapeHtml(name)) : c.greetingAnon;

  const rows = input.lines
    .map(
      (l) => `<tr>
        <td style="padding:8px 0;color:#3a4541;font-size:15px;">${escapeHtml(l.label)} &times; ${l.units}</td>
        <td style="padding:8px 0;color:#0f1714;font-size:15px;text-align:right;white-space:nowrap;">${escapeHtml(
          formatOrderMoney(l.totalCents, input.currency),
        )}</td>
      </tr>`,
    )
    .join("");

  const moneyLine = isPaid
    ? `<p style="margin:16px 0 0;color:#2e7d5b;font-size:15px;">${c.paidLine}</p>`
    : `<p style="margin:16px 0 0;color:#b45309;font-size:15px;">${c.payInPersonLine}<br>
         <strong>${escapeHtml(c.outstandingLabel)}: ${escapeHtml(
           formatOrderMoney(outstanding, input.currency),
         )}</strong></p>`;

  const receiptButton = input.receiptUrl
    ? `<p style="margin:28px 0 0;">
         <a href="${escapeHtml(input.receiptUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1f4a3a;color:#fffdf7;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(
           c.viewReceipt,
         )}</a>
       </p>`
    : "";

  return `<!doctype html>
<html lang="${input.locale}"><body style="margin:0;padding:32px 16px;background:#f1ede3;font-family:'Geist',Inter,system-ui,sans-serif;color:#0f1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffdf7;border-radius:20px;border:1px solid rgba(15,23,20,0.08);">
    <tr><td style="padding:40px 40px 32px;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.26em;text-transform:uppercase;color:#1f4a3a;">${escapeHtml(
        c.confirmedKicker,
      )}</div>
      <h1 style="font-size:28px;line-height:1.15;font-weight:500;margin:16px 0 0;letter-spacing:-0.025em;">${greeting}</h1>
      <p style="margin:20px 0 0;color:#3a4541;font-size:15px;line-height:1.6;">${escapeHtml(
        c.receivedBy(input.tenantName),
      )}</p>
      <div style="margin:28px 0 0;font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#1f4a3a;">${escapeHtml(
        c.itemsHeading,
      )}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;border-top:1px solid rgba(15,23,20,0.08);">
        ${rows}
        <tr>
          <td style="padding:12px 0 0;border-top:1px solid rgba(15,23,20,0.08);font-size:15px;font-weight:600;">${escapeHtml(
            c.totalLabel,
          )}</td>
          <td style="padding:12px 0 0;border-top:1px solid rgba(15,23,20,0.08);font-size:15px;font-weight:600;text-align:right;white-space:nowrap;">${escapeHtml(
            formatOrderMoney(input.totalCents, input.currency),
          )}</td>
        </tr>
      </table>
      ${moneyLine}
      ${receiptButton}
      <p style="margin:28px 0 0;color:#6b7671;font-size:13px;line-height:1.6;">${escapeHtml(noun)}</p>
    </td></tr>
  </table>
</body></html>`;
}
