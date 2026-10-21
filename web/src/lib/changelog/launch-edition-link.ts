/**
 * TUL-1482: the home-page link to the Launch Edition.
 *
 * The link exists only while the changelog is LIVE (CHANGELOG_PUBLIC_LAUNCH is
 * exactly "1", no placeholder copy is published, and a Launch Edition is
 * published; see `changelogLaunchState`). Until then `buildLaunchEditionLink`
 * returns null and nothing renders. The text comes from the published Notion
 * entry, so the wording Oran signs off in Notion is the wording on the home page.
 */
import { withLocaleHref } from "@/i18n/pathnames";
import type { AudienceLanguage } from "@/lib/email/product-update/audience";
import type { LaunchInput } from "@/lib/email/product-update/template";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

import {
  getChangelogLaunchState,
  toEntryView,
  type ChangelogLaunchState,
  type ChangelogLocale,
} from "./public-read";

export type LaunchEditionLink = {
  /** Path without the language prefix; callers pass it through `withLocaleHref`. */
  path: string;
  title: string;
  eyebrow: string;
  cta: string;
};

const COPY = {
  en: { eyebrow: "New", cta: "See what's new" },
  es: { eyebrow: "Nuevo", cta: "Ver las novedades" },
} as const;

export function launchEditionPath(id: string, locale: ChangelogLocale): string {
  return locale === "es" ? `/novedades/${id}` : `/changelog/${id}`;
}

export function buildLaunchEditionLink(state: ChangelogLaunchState, locale: ChangelogLocale): LaunchEditionLink | null {
  if (!state.live) return null;
  const entry = toEntryView(state.edition, locale);
  return { path: launchEditionPath(entry.id, locale), title: entry.title, ...COPY[locale] };
}

/** Reads the table only when the flag is on, so a flag-off home page pays nothing. */
export async function loadLaunchEditionLink(locale: ChangelogLocale): Promise<LaunchEditionLink | null> {
  return buildLaunchEditionLink(await getChangelogLaunchState(), locale);
}

const EMAIL_UTM = "utm_source=email&utm_medium=email&utm_campaign=launch-edition";

/** Absolute, language-prefixed URL of the Launch Edition entry, tagged for the launch email. */
export function launchEditionEmailUrl(id: string, language: ChangelogLocale): string {
  return `https://${PLATFORM_BRAND.domain}${withLocaleHref(launchEditionPath(id, language), language)}?${EMAIL_UTM}`;
}

/**
 * Input for the tier 3 launch email (`buildLaunchEmail`, TUL-1397). The headline,
 * summary and button link all come from the published Launch Edition entry, so
 * the email says exactly what Oran signed off in Notion. Returns null until the
 * changelog is live, so the email can never link to a page that is not public.
 * This only builds the input: nothing here sends mail.
 */
export function buildLaunchEditionEmailInput(
  state: ChangelogLaunchState,
  language: AudienceLanguage,
  unsubscribeUrl: string,
): LaunchInput | null {
  if (!state.live) return null;
  const entry = toEntryView(state.edition, language);
  return {
    language,
    headline: entry.title,
    summary: entry.summary,
    ctaUrl: launchEditionEmailUrl(entry.id, language),
    unsubscribeUrl,
  };
}
