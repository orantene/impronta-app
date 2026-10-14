/**
 * The guest claim email (TUL-G6): subject + HTML, English or neutral Mexican
 * Spanish by the guest's locale. Pure, no I/O.
 */

export type GuestClaimBrand = { wordmark: string; accountName: string; footerDomain: string; homeHref: string };

const COPY = {
  en: {
    subject: (who: string) => `Continue your conversation with ${who}`,
    heading: "Pick up where you left off",
    body: (who: string) =>
      `Your conversation with <strong>${who}</strong> is saved. Use the button below to sign in and continue it from your dashboard. No password needed.`,
    cta: "Pick up the conversation",
    private: "This link signs you in automatically. Keep it private. It works on any device.",
    reason: (brand: string) => `You received this because you started a conversation on ${brand}.`,
  },
  es: {
    subject: (who: string) => `Continúa tu conversación con ${who}`,
    heading: "Retoma donde te quedaste",
    body: (who: string) =>
      `Tu conversación con <strong>${who}</strong> está guardada. Usa el botón para iniciar sesión y continuarla desde tu cuenta. No necesitas contraseña.`,
    cta: "Retomar la conversación",
    private: "Este enlace inicia tu sesión automáticamente. Mantenlo privado. Funciona en cualquier dispositivo.",
    reason: (brand: string) => `Recibes esto porque iniciaste una conversación en ${brand}.`,
  },
} as const;

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildGuestClaimEmail(
  actionLink: string,
  talentName: string,
  brand: GuestClaimBrand,
  locale?: string | null,
): { subject: string; html: string } {
  const lang = (locale ?? "").toLowerCase().startsWith("es") ? "es" : "en";
  const c = COPY[lang];
  const name = talentName.trim() || brand.accountName;
  const safeName = escapeHtml(name);
  const subject = c.subject(name);

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <a href="${brand.homeHref}" style="font-family:Georgia,serif;font-size:18px;letter-spacing:0.2em;color:#1a1a1a;text-decoration:none;font-weight:600;">${escapeHtml(brand.wordmark)}</a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;padding:32px 32px 28px;">
              <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">${c.heading}</h2>
              <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
                ${c.body(safeName)}
              </p>
              <a href="${actionLink}" style="display:inline-block;margin-top:4px;padding:12px 24px;background:#0b0b0d;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${c.cta} &rarr;</a>
              <p style="margin:16px 0 0;font-size:12px;color:#888888;">${c.private}</p>
            </td>
          </tr>
          <tr>
            <td style="padding-top:20px;text-align:center;font-size:12px;color:#888888;">
              ${c.reason(escapeHtml(brand.accountName))}
              <br/>
              <a href="${brand.homeHref}" style="color:#888888;">${escapeHtml(brand.footerDomain)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
