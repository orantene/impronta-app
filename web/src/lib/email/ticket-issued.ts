/**
 * The ticket e-mail: what a guest receives when an admission is minted for
 * them (a card purchase, a free tier, a comp) and again on "resend".
 *
 * Until this file there was NO purchased-ticket e-mail at all. The paid path
 * minted admissions and sent nothing; the two "Your ticket" stubs in
 * `event-holds.ts` and `ticket-self.ts` said a ticket was attached and
 * attached nothing. A guest's only QR was the receipt page, if they kept the
 * tab open.
 *
 * Pure: no I/O, no `server-only`, so it is unit-testable like
 * `order-confirmation.ts`. Delivery (recipient, locale, idempotency) lives in
 * `lib/events/ticket-delivery.ts`.
 *
 * The QR is a HOSTED image (`/api/tickets/<token>/qr`), not a data URI:
 * Gmail strips `data:` images. A client that blocks remote images still gets
 * the typed code and the "Ver mi entrada" button, both of which the door can
 * work from.
 */

import type { EmailBrand } from "@/lib/brand/resolve-tenant-brand";

export type TicketEmailLocale = "en" | "es";

export type TicketEmailAdmission = {
  /** The signed token — what the door scans and what `/ticket/<code>` reads. */
  code: string;
  qrUrl: string;
  ticketUrl: string;
  tierLabel: string;
  /** People this one admission lets in (a "Mesa para 10" admits 10). */
  partySize: number;
  seatLabel?: string | null;
};

export type TicketIssuedInput = {
  locale: TicketEmailLocale;
  brand: Pick<EmailBrand, "accountName" | "logoUrl" | "accent" | "accentOn" | "footerDomain">;
  eventTitle: string;
  /** Already formatted in the venue's zone: "sábado 3 de octubre, 18:00". */
  nightLabel: string;
  venueName?: string | null;
  holderName?: string | null;
  receiptUrl?: string | null;
  admissions: TicketEmailAdmission[];
  isResend?: boolean;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COPY = {
  es: {
    subject: (brand: string, event: string, n: number, resend: boolean) =>
      `${brand}: ${resend ? "tu entrada, otra vez" : n > 1 ? "tus entradas" : "tu entrada"} · ${event}`,
    kicker: (resend: boolean) => (resend ? "Reenvío de tu entrada" : "Tu entrada"),
    hello: (name: string | null) => (name ? `Hola ${name},` : "Hola,"),
    intro: (n: number) =>
      n > 1
        ? "Aquí van tus entradas. Muestra cada QR en la puerta desde el teléfono; no hace falta imprimir."
        : "Aquí va tu entrada. Muestra el QR en la puerta desde el teléfono; no hace falta imprimir.",
    admits: (n: number) => (n > 1 ? `Admite ${n} personas` : "Admite 1 persona"),
    seat: "Lugar",
    codeLabel: "Código",
    view: "Ver mi entrada",
    receipt: "Ver recibo",
    manage: "Desde el enlace puedes reenviar o transferir la entrada a otra persona.",
    venue: (v: string) => `Lugar: ${v}`,
    footer: (brand: string) => `Recibes este correo porque se emitió una entrada a tu nombre en ${brand}.`,
    fallback: "Si no ves el código QR, abre el botón de arriba: allí está tu entrada.",
  },
  en: {
    subject: (brand: string, event: string, n: number, resend: boolean) =>
      `${brand}: ${resend ? "your ticket, again" : n > 1 ? "your tickets" : "your ticket"} · ${event}`,
    kicker: (resend: boolean) => (resend ? "Your ticket, resent" : "Your ticket"),
    hello: (name: string | null) => (name ? `Hi ${name},` : "Hi,"),
    intro: (n: number) =>
      n > 1
        ? "Here are your tickets. Show each QR at the door from your phone; no need to print."
        : "Here is your ticket. Show the QR at the door from your phone; no need to print.",
    admits: (n: number) => (n > 1 ? `Admits ${n} people` : "Admits 1 person"),
    seat: "Seat",
    codeLabel: "Code",
    view: "View my ticket",
    receipt: "View receipt",
    manage: "From that link you can resend the ticket or transfer it to someone else.",
    venue: (v: string) => `Venue: ${v}`,
    footer: (brand: string) => `You are receiving this because a ticket was issued in your name at ${brand}.`,
    fallback: "If the QR does not show, open the button above: your ticket is there.",
  },
} as const;

export function ticketIssuedSubject(input: TicketIssuedInput): string {
  const c = COPY[input.locale];
  return c.subject(input.brand.accountName, input.eventTitle, input.admissions.length, Boolean(input.isResend));
}

export function renderTicketIssuedEmail(input: TicketIssuedInput): string {
  const c = COPY[input.locale];
  const accent = input.brand.accent ?? "#111111";
  const accentOn = input.brand.accentOn ?? "#ffffff";
  const brandName = escapeHtml(input.brand.accountName);
  const header = input.brand.logoUrl
    ? `<img src="${escapeHtml(input.brand.logoUrl)}" alt="${brandName}" height="36" style="display:block;height:36px;width:auto;">`
    : `<div style="font-size:18px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${accent};">${brandName}</div>`;

  const admissions = input.admissions
    .map((a, i) => {
      const n = input.admissions.length > 1 ? ` ${i + 1}/${input.admissions.length}` : "";
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border:1px solid rgba(15,23,20,0.12);border-radius:16px;">
        <tr><td style="padding:24px;text-align:center;">
          <div style="font-size:15px;font-weight:600;color:#0f1714;">${escapeHtml(a.tierLabel)}${n}</div>
          <div style="margin:4px 0 0;font-size:13px;color:#6b7671;">${escapeHtml(c.admits(a.partySize))}${
            a.seatLabel ? ` · ${escapeHtml(c.seat)} ${escapeHtml(a.seatLabel)}` : ""
          }</div>
          <img src="${escapeHtml(a.qrUrl)}" width="220" height="220" alt="QR" style="display:block;width:220px;height:220px;margin:16px auto 0;background:#ffffff;border-radius:8px;">
          <div style="margin:12px 0 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#6b7671;">${escapeHtml(c.codeLabel)}</div>
          <div style="margin:4px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#0f1714;word-break:break-all;">${escapeHtml(a.code)}</div>
          <p style="margin:16px 0 0;">
            <a href="${escapeHtml(a.ticketUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${accent};color:${accentOn};font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(c.view)}</a>
          </p>
        </td></tr>
      </table>`;
    })
    .join("");

  const receipt = input.receiptUrl
    ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(input.receiptUrl)}" style="color:${accent};font-size:14px;font-weight:600;">${escapeHtml(c.receipt)}</a></p>`
    : "";

  return `<!doctype html>
<html lang="${input.locale}"><body style="margin:0;padding:32px 16px;background:#f1ede3;font-family:'Geist',Inter,system-ui,sans-serif;color:#0f1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffdf7;border-radius:20px;border:1px solid rgba(15,23,20,0.08);">
    <tr><td style="padding:36px 36px 32px;">
      ${header}
      <div style="margin:28px 0 0;font-size:11px;font-weight:600;letter-spacing:0.26em;text-transform:uppercase;color:${accent};">${escapeHtml(c.kicker(Boolean(input.isResend)))}</div>
      <h1 style="font-size:26px;line-height:1.2;font-weight:500;margin:12px 0 0;letter-spacing:-0.02em;">${escapeHtml(input.eventTitle)}</h1>
      <p style="margin:8px 0 0;color:#3a4541;font-size:15px;">${escapeHtml(input.nightLabel)}${
        input.venueName ? `<br>${escapeHtml(c.venue(input.venueName))}` : ""
      }</p>
      <p style="margin:20px 0 0;color:#3a4541;font-size:15px;line-height:1.6;">${escapeHtml(c.hello(input.holderName ?? null))}<br>${escapeHtml(c.intro(input.admissions.length))}</p>
      ${admissions}
      <p style="margin:20px 0 0;color:#6b7671;font-size:13px;line-height:1.6;">${escapeHtml(c.fallback)}<br>${escapeHtml(c.manage)}</p>
      ${receipt}
      <p style="margin:28px 0 0;color:#6b7671;font-size:12px;line-height:1.6;">${escapeHtml(c.footer(input.brand.accountName))}</p>
    </td></tr>
  </table>
</body></html>`;
}
