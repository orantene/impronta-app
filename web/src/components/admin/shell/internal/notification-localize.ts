/**
 * Notification copy localisation (TUL-52 D).
 *
 * `user_notifications` rows are stored with English titles/bodies and a
 * server-built "5d ago" string. The dashboard renders them in the viewer's
 * language: titles/bodies go through the dashboard dictionary (exact match,
 * unknown strings pass through untouched, since some are talent/client
 * content), and the age is computed from the row's timestamp with Intl.
 */

import { themeUpdateCopy } from "@/lib/talent-site/theme-releases/manager/notify";
import { translateDashboardText } from "./dashboard-i18n";

const DAY_OF_TITLES_ES: Record<string, string> = {
  "Your event is tomorrow": "Tu evento es mañana",
  "Your appointment is tomorrow": "Tu cita es mañana",
  "Reminder: your event is tomorrow": "Recordatorio: tu evento es mañana",
  "Reminder: your appointment is tomorrow": "Recordatorio: tu cita es mañana",
};

const THEME_UPDATE_TITLE = /^(.+) (?:has an update|tiene una actualización)$/u;

/**
 * Theme-release bells are stored in the talent's preferred locale at fan-out,
 * so either language can arrive here; re-render them in the viewer's.
 */
function localizeThemeUpdateText(text: string, locale: string): string | null {
  const title = text.match(THEME_UPDATE_TITLE);
  if (title) return themeUpdateCopy(title[1], locale).title;
  if (text === themeUpdateCopy("", "en").body || text === themeUpdateCopy("", "es").body) {
    return themeUpdateCopy("", locale).body;
  }
  return null;
}

/**
 * Short relative age via Intl ("hace 5 d", "5d ago", "ahora"/"now").
 * Beyond a week it falls back to a localized short date.
 */
export function formatNotificationAge(
  iso: string | null | undefined,
  locale: string,
  now: Date = new Date(),
): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffSec = Math.round((now.getTime() - then.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  if (diffSec < 60) return rtf.format(0, "second");
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  return then.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/** Dictionary lookup plus the few parameterised catalog titles ("New booking request"). */
export function localizeNotificationText(
  text: string | null | undefined,
  locale: string,
): string {
  if (!text) return "";
  const themeUpdate = localizeThemeUpdateText(text, locale);
  if (themeUpdate !== null) return themeUpdate;
  if (!locale.toLowerCase().startsWith("es")) return text;
  const direct = translateDashboardText(text, locale);
  if (direct !== text) return direct;
  const request = text.match(/^New (.+) request$/u);
  if (request) return `Nueva solicitud de ${translateDashboardText(request[1], locale).toLowerCase()}`;
  const confirmed = text.match(/^(.+) confirmed$/u);
  if (confirmed) return `${translateDashboardText(confirmed[1], locale)} confirmada`;
  // TUL-676: offer bodies carry a money amount / contact name, so match by shape.
  const offerReview = text.match(/^(.+?)(?: for (.+?))?\. Open the Offer tab to review and approve\.$/u);
  if (offerReview) {
    const head = offerReview[2] ? `${offerReview[1]} para ${offerReview[2]}` : offerReview[1];
    return `${head}. Abre la pestaña Oferta para revisarla y aprobarla.`;
  }
  const offerSent = text.match(/^(.+): offer sent\. Waiting on approvals\.$/u);
  if (offerSent) return `${offerSent[1]}: oferta enviada. Esperando aprobaciones.`;
  const offerWaiting = text.match(/^(.+): (.+)\. Waiting on approvals\.$/u);
  if (offerWaiting) return `${offerWaiting[1]}: ${offerWaiting[2]}. Esperando aprobaciones.`;
  // TUL-721: day-of reminder bells (title + body). The body carries a raw ISO date.
  const dayOf = DAY_OF_TITLES_ES[text];
  if (dayOf) return dayOf;
  if (text === "Your booking is tomorrow.") return "Tu reserva es mañana.";
  const dayOfBody = text.match(/^Your booking on (\d{4})-(\d{2})-(\d{2}) is tomorrow\.$/u);
  if (dayOfBody) {
    const d = new Date(Date.UTC(Number(dayOfBody[1]), Number(dayOfBody[2]) - 1, Number(dayOfBody[3])));
    const label = d.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    return `Tu reserva del ${label} es mañana.`;
  }
  // TUL-391: support-ticket bell titles carry the ticket subject / number.
  const resolved = text.match(/^Resolved: (.+)$/u);
  if (resolved) return `Resuelto: ${resolved[1] === "your ticket" ? "tu ticket" : resolved[1]}`;
  // TUL-1867: the requester-side ticket bells (no ticket number) and the agent reply title.
  if (text === "Your ticket needs you") return "Tu ticket te necesita";
  if (text === "Support replied to your ticket." || text === "Support replied to your ticket") {
    return "Soporte respondió a tu ticket.";
  }
  const agentReply = text.match(/^(.+) replied - (.+)$/u);
  if (agentReply) return `${agentReply[1]} respondió - ${agentReply[2] === "your ticket" ? "tu ticket" : agentReply[2]}`;
  const needsYou = text.match(/^Ticket #(\d+) needs you$/u);
  if (needsYou) return `El ticket #${needsYou[1]} te necesita`;
  const replyOn = text.match(/^Reply on #(\d+)$/u);
  if (replyOn) return `Respuesta en #${replyOn[1]}`;
  const stillHelp = text.match(/^Still need help on #(\d+)\?$/u);
  if (stillHelp) return `¿Sigues necesitando ayuda con #${stillHelp[1]}?`;
  const fixExpired = text.match(/^A proposed fix on #(\d+) expired$/u);
  if (fixExpired) return `Venció una corrección propuesta en #${fixExpired[1]}`;
  const ticket = text.match(/^New support ticket #(\d+)$/u);
  if (ticket) return `Nuevo ticket de soporte #${ticket[1]}`;
  return text;
}
