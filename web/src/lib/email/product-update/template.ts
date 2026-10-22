/**
 * TUL-1397: the monthly "Novedades de Tulala" / "What's new at Tulala" email
 * and the tier 3 launch email. Pure HTML builders: they return a subject and a
 * string and never send anything. Plain inline-styled HTML, same approach as
 * the newsletter welcome email, no tenant branding.
 *
 * The caller passes the month's Published changelog entries already localised
 * (title and summary in the recipient's language) so this file does not depend
 * on the changelog table.
 */

import type { AudienceLanguage } from "./audience";

export type DigestEntry = {
  title: string;
  summary: string;
  /** Absolute URL to the entry or the changelog page. */
  url: string;
};

export type ProductUpdateInput = {
  language: AudienceLanguage;
  /** First day of the month the digest covers, as year and 1-12 month. */
  year: number;
  month: number;
  entries: readonly DigestEntry[];
  /** One-click unsubscribe link. Required: a newsletter never ships without it. */
  unsubscribeUrl: string;
  /** Absolute link to the full changelog. */
  changelogUrl: string;
};

export type LaunchInput = {
  language: AudienceLanguage;
  headline: string;
  summary: string;
  ctaUrl: string;
  unsubscribeUrl: string;
};

const MONTHS: Record<AudienceLanguage, readonly string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

const COPY = {
  es: {
    brandLine: "Novedades de Tulala",
    subject: (m: string, y: number) => `Novedades de Tulala: ${m} ${y}`,
    preheader: (n: number) => (n === 1 ? "Una novedad este mes." : `${n} novedades este mes.`),
    heading: (m: string, y: number) => `Lo nuevo en ${m} ${y}`,
    intro: "Esto es lo que cambió en Tulala este mes, escrito para quien lo usa.",
    empty: "Este mes no hubo novedades para ti. Seguimos trabajando.",
    readMore: "Ver detalle",
    all: "Ver todas las novedades",
    signoff: "Hasta pronto,\nEl equipo de Tulala",
    unsubPrefix: "¿Ya no quieres estos correos? ",
    unsub: "Darte de baja",
    reason: "Recibes este correo porque aceptaste recibir novedades de Tulala.",
    launchSubject: (h: string) => h,
  },
  en: {
    brandLine: "What's new at Tulala",
    subject: (m: string, y: number) => `What's new at Tulala: ${m} ${y}`,
    preheader: (n: number) => (n === 1 ? "One update this month." : `${n} updates this month.`),
    heading: (m: string, y: number) => `What's new in ${m} ${y}`,
    intro: "Here is what changed in Tulala this month, written for the people who use it.",
    empty: "No updates for you this month. We are still working.",
    readMore: "See details",
    all: "See all updates",
    signoff: "Talk soon,\nThe Tulala team",
    unsubPrefix: "Don't want these emails? ",
    unsub: "Unsubscribe",
    reason: "You are receiving this because you agreed to hear about Tulala updates.",
    launchSubject: (h: string) => h,
  },
} as const;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Only http(s) links go into an href. Anything else becomes "#". */
function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : "#";
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function shell(args: {
  language: AudienceLanguage;
  title: string;
  preheader: string;
  inner: string;
  unsubscribeUrl: string;
}): string {
  const c = COPY[args.language];
  return `<!doctype html>
<html lang="${args.language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(args.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f6f4;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(args.preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f4;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e7e3;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:-0.01em;color:#1a1a17;">${esc(c.brandLine)}</div>
              </td>
            </tr>
${args.inner}
            <tr>
              <td style="padding:20px 32px 28px;border-top:1px solid #eeeeea;">
                <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.6;color:#9a9a92;">${esc(c.reason)}</p>
                <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:#9a9a92;">${esc(c.unsubPrefix)}<a href="${esc(safeUrl(args.unsubscribeUrl))}" style="color:#6b6b63;text-decoration:underline;">${esc(c.unsub)}</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function signoffHtml(language: AudienceLanguage): string {
  return esc(COPY[language].signoff).replace(/\n/g, "<br />");
}

export function buildProductUpdateEmail(input: ProductUpdateInput): { subject: string; html: string } {
  if (!input.unsubscribeUrl) throw new Error("product update email requires an unsubscribe URL");
  const c = COPY[input.language];
  const monthName = MONTHS[input.language][Math.min(11, Math.max(0, input.month - 1))];
  const subject = c.subject(monthName, input.year);

  const items = input.entries
    .map(
      (e) => `            <tr>
              <td style="padding:0 32px 20px;">
                <h2 style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.3;color:#1a1a17;">${esc(e.title)}</h2>
                <p style="margin:0 0 8px;font-family:${FONT};font-size:15px;line-height:1.6;color:#3a3a35;">${esc(e.summary)}</p>
                <a href="${esc(safeUrl(e.url))}" style="font-family:${FONT};font-size:14px;color:#1f4a3a;text-decoration:underline;">${esc(c.readMore)}</a>
              </td>
            </tr>`,
    )
    .join("\n");

  const body =
    input.entries.length > 0
      ? items
      : `            <tr>
              <td style="padding:0 32px 20px;">
                <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:#3a3a35;">${esc(c.empty)}</p>
              </td>
            </tr>`;

  const inner = `            <tr>
              <td style="padding:8px 32px 16px;">
                <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:#1a1a17;">${esc(c.heading(monthName, input.year))}</h1>
                <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:#3a3a35;">${esc(c.intro)}</p>
              </td>
            </tr>
${body}
            <tr>
              <td style="padding:4px 32px 24px;">
                <a href="${esc(safeUrl(input.changelogUrl))}" style="display:inline-block;background:#1a1a17;color:#ffffff;text-decoration:none;font-family:${FONT};font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">${esc(c.all)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:#3a3a35;">${signoffHtml(input.language)}</p>
              </td>
            </tr>`;

  return {
    subject,
    html: shell({
      language: input.language,
      title: subject,
      preheader: c.preheader(input.entries.length),
      inner,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  };
}

/** Tier 3 launch email: one headline, one summary, one button. */
export function buildLaunchEmail(input: LaunchInput): { subject: string; html: string } {
  if (!input.unsubscribeUrl) throw new Error("launch email requires an unsubscribe URL");
  const c = COPY[input.language];
  const subject = c.launchSubject(input.headline);
  const cta = input.language === "es" ? "Ver qué hay de nuevo" : "See what is new";
  const inner = `            <tr>
              <td style="padding:8px 32px 16px;">
                <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:#1a1a17;">${esc(input.headline)}</h1>
                <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:#3a3a35;">${esc(input.summary)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 32px 24px;">
                <a href="${esc(safeUrl(input.ctaUrl))}" style="display:inline-block;background:#1a1a17;color:#ffffff;text-decoration:none;font-family:${FONT};font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">${esc(cta)}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:#3a3a35;">${signoffHtml(input.language)}</p>
              </td>
            </tr>`;
  return {
    subject,
    html: shell({
      language: input.language,
      title: subject,
      preheader: input.summary.slice(0, 110),
      inner,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  };
}
