/**
 * Notification copy localisation (TUL-52 D).
 *
 * `user_notifications` rows are stored with English titles/bodies and a
 * server-built "5d ago" string. The dashboard renders them in the viewer's
 * language: titles/bodies go through the dashboard dictionary (exact match,
 * unknown strings pass through untouched, since some are talent/client
 * content), and the age is computed from the row's timestamp with Intl.
 */

import { translateDashboardText } from "./dashboard-i18n";

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
  if (!locale.toLowerCase().startsWith("es")) return text;
  const direct = translateDashboardText(text, locale);
  if (direct !== text) return direct;
  const request = text.match(/^New (.+) request$/u);
  if (request) return `Nueva solicitud de ${translateDashboardText(request[1], locale).toLowerCase()}`;
  const confirmed = text.match(/^(.+) confirmed$/u);
  if (confirmed) return `${translateDashboardText(confirmed[1], locale)} confirmada`;
  const ticket = text.match(/^New support ticket #(\d+)$/u);
  if (ticket) return `Nuevo ticket de soporte #${ticket[1]}`;
  return text;
}
