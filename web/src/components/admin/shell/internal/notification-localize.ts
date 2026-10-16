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
  const ticket = text.match(/^New support ticket #(\d+)$/u);
  if (ticket) return `Nuevo ticket de soporte #${ticket[1]}`;
  return text;
}
