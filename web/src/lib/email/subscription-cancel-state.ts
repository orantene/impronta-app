/**
 * TUL-832: confirmation emails when a subscription is set to cancel at period
 * end ("Your plan ends on <date>" + Resume link) and when it is resumed
 * ("Your plan continues"). ES/EN, same shell as payment-failed.ts.
 */
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export type CancelStateEmailInput = {
  locale: "es" | "en";
  /** true = now cancelling at period end; false = resumed. */
  cancelAtPeriodEnd: boolean;
  /** ISO end of the paid period. Null renders a date-free sentence. */
  periodEnd: string | null;
  /** Where the customer resumes (or manages) the plan. */
  actionUrl: string;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatPeriodEnd(iso: string | null, locale: "es" | "en"): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export function cancelStateSubject(locale: "es" | "en", cancelAtPeriodEnd: boolean): string {
  if (cancelAtPeriodEnd) return locale === "es" ? "Tu plan terminará al final del periodo" : "Your plan will end at the end of the period";
  return locale === "es" ? "Tu plan continúa" : "Your plan continues";
}

export function cancelStateBody(input: CancelStateEmailInput): string {
  const es = input.locale === "es";
  const date = formatPeriodEnd(input.periodEnd, input.locale);
  if (input.cancelAtPeriodEnd) {
    return es
      ? `Tu plan de ${PLATFORM_BRAND.name} termina el ${date ?? "final del periodo actual"}. Hasta entonces conservas todas tus funciones y no se te cobrará de nuevo. Tu contenido no se borra.`
      : `Your ${PLATFORM_BRAND.name} plan ends on ${date ?? "the last day of the current period"}. You keep all your features until then and you won't be charged again. Your content is never deleted.`;
  }
  return es
    ? `Reanudaste tu plan de ${PLATFORM_BRAND.name}. Sigue activo y se renovará con normalidad${date ? ` el ${date}` : ""}.`
    : `You resumed your ${PLATFORM_BRAND.name} plan. It stays active and renews as usual${date ? ` on ${date}` : ""}.`;
}

export function renderCancelStateEmail(input: CancelStateEmailInput): string {
  const es = input.locale === "es";
  const title = cancelStateSubject(input.locale, input.cancelAtPeriodEnd);
  const body = cancelStateBody(input);
  const cta = input.cancelAtPeriodEnd ? (es ? "Reanudar plan" : "Resume plan") : es ? "Ver mi plan" : "View my plan";
  return `<!doctype html>
<html lang="${input.locale}"><body style="margin:0;padding:32px 16px;background:#f1ede3;font-family:Inter,system-ui,sans-serif;color:#0f1714;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffdf7;border-radius:20px;border:1px solid rgba(15,23,20,0.08);">
    <tr><td style="padding:40px;">
      <h1 style="font-size:26px;line-height:1.2;font-weight:500;margin:0;">${esc(title)}</h1>
      <p style="margin:20px 0 0;color:#3a4541;font-size:15px;line-height:1.6;">${esc(body)}</p>
      <p style="margin:28px 0 0;"><a href="${esc(input.actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#0f1714;color:#fffdf7;font-size:14px;font-weight:600;text-decoration:none;">${esc(cta)}</a></p>
    </td></tr>
  </table>
</body></html>`;
}
