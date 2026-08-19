"use client";

import { interpolate } from "@/i18n/interpolate";

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * Short, locale-aware absolute date ("Jul 9", or "Jul 9, 2025" across a
 * year boundary). Shared tail of the relative-timestamp formatters below,
 * and reused directly wherever a plain absolute date is enough (e.g. the
 * Website hero's "next scheduled" stat).
 */
export function formatShortDate(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const sameYear = new Date(then).getFullYear() === new Date().getFullYear();
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
    }).format(then);
  } catch {
    return new Date(then).toDateString();
  }
}

/**
 * Short, locale-aware "updated" timestamp for a page card (W1-L9 polish —
 * cards previously showed the raw ISO timestamp verbatim). Relative for the
 * first week ("2h ago", "3d ago" — same convention as Inbox/Pitches), then
 * falls back to `formatShortDate`.
 */
export function formatPageUpdatedAt(
  iso: string,
  t: (key: string) => string,
  locale: string,
): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  if (diff < MIN_MS) return t("dashboard.adminWebsite.relJustNow");
  if (diff < HOUR_MS) return interpolate(t("dashboard.adminWebsite.relMinsAgo"), { count: Math.round(diff / MIN_MS) });
  if (diff < DAY_MS) return interpolate(t("dashboard.adminWebsite.relHoursAgo"), { count: Math.round(diff / HOUR_MS) });
  if (diff < WEEK_MS) return interpolate(t("dashboard.adminWebsite.relDaysAgo"), { count: Math.round(diff / DAY_MS) });
  return formatShortDate(iso, locale);
}

/**
 * Locale-aware "publishes at" string for a scheduled page card. Mirror of
 * `formatPageUpdatedAt` but for a FUTURE timestamp: relative buckets
 * ("in 2h", "in 3d") for the first week, then a short absolute date. This
 * is what makes the Scheduled tab informative rather than just a filter —
 * see the admin Website → Pages "Scheduled" tab fix.
 */
export function formatScheduledPublishAt(
  iso: string,
  t: (key: string) => string,
  locale: string,
): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = then - Date.now();
  if (diff <= MIN_MS) return t("dashboard.adminWebsite.pageCardPublishesSoon");
  if (diff < HOUR_MS) return interpolate(t("dashboard.adminWebsite.pageCardPublishesInMins"), { count: Math.round(diff / MIN_MS) });
  if (diff < DAY_MS) return interpolate(t("dashboard.adminWebsite.pageCardPublishesInHours"), { count: Math.round(diff / HOUR_MS) });
  if (diff < WEEK_MS) return interpolate(t("dashboard.adminWebsite.pageCardPublishesInDays"), { count: Math.round(diff / DAY_MS) });
  return interpolate(t("dashboard.adminWebsite.pageCardPublishesOn"), { date: formatShortDate(iso, locale) });
}

// WebsitePerformance and its helpers (Tile / FunnelStep / FunnelArrow) were
// DELETED in W2, replaced by the dedicated, token-class-only
// WebsiteAnalyticsPage.tsx. `ConfigStatusRow` (orphaned when the Setup page
// took over its job) went with them. What remains is the shared date
// formatting this file exports to the other Website page modules.
