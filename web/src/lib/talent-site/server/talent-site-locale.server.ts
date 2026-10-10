import "server-only";

import { localeUrlSettings, type LocaleUrlSettings } from "@/i18n/pathnames";
import { getLanguageSettingsPublicCached } from "@/lib/language-settings/get-language-settings";
import type { BuilderNodeContentLocaleOptions } from "@/lib/site-admin/builder-node/render";
import { resolveDesignLocale } from "@/lib/site-admin/server/design-locale";
import type { TenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { loadTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";
import {
  boundTalentSiteLocale,
  talentSiteSwitcherHrefs,
  talentSiteUrlSettings,
} from "@/lib/talent-site/talent-site-locale-routing";
import { cachePublicTalentSiteData } from "./public-site-data-cache.server";

/**
 * Talent site language context (PR 4, 2026-09-29): the talent's own
 * languages, loaded ONCE per render and shared by the header switcher, the
 * builder overlay resolution and the SEO alternates.
 */
export interface TalentSiteLocaleContext {
  settings: TenantLocaleSettings;
  /** The render locale, bounded to the talent's set (else their primary). */
  locale: string;
  /** Fallback walk for `locale`: [visitor, primary, ...rest]. Never empty. */
  chain: readonly string[];
  /** Builder `node.i18n` overlay resolution for every render call. */
  contentLocale: BuilderNodeContentLocaleOptions;
  /** The URL grammar the page is addressed in (talent host or platform). */
  grammar: LocaleUrlSettings;
  /** Header switcher links, one per language. Undefined when single. */
  switcherHrefs?: Record<string, string>;
}

export async function loadTalentSiteLocaleContext(input: {
  talentProfileId: string;
  requestedLocale: string | null | undefined;
  /** "host-root" = the talent host's own grammar; "path" = platform paths. */
  hrefMode?: "path" | "host-root";
  /** Locale-free path of the page being rendered. */
  pagePath?: string;
  /** Editor canvas only: dim untranslated nodes. */
  editorPreview?: boolean;
  /** Owner draft/edit preview — skip the public Data Cache. */
  bypassCache?: boolean;
}): Promise<TalentSiteLocaleContext> {
  // Editor / owner preview must never serve a stale public cache entry.
  if (input.editorPreview || input.bypassCache) {
    return loadTalentSiteLocaleContextUncached(input);
  }
  const hrefMode = input.hrefMode ?? "path";
  const requested = (input.requestedLocale ?? "").trim().toLowerCase() || "default";
  const pagePath = input.pagePath ?? "/";
  return cachePublicTalentSiteData(
    input.talentProfileId,
    "locale",
    [hrefMode, requested, pagePath],
    () => loadTalentSiteLocaleContextUncached(input),
  );
}

async function loadTalentSiteLocaleContextUncached(input: {
  talentProfileId: string;
  requestedLocale: string | null | undefined;
  hrefMode?: "path" | "host-root";
  pagePath?: string;
  editorPreview?: boolean;
}): Promise<TalentSiteLocaleContext> {
  const settings = await loadTalentLocaleSettings(input.talentProfileId);
  const primary = settings.defaultLocale;
  const supported = settings.supportedLocales;
  const locale = boundTalentSiteLocale(input.requestedLocale, primary, supported);
  const design = resolveDesignLocale(settings, locale, { editorPreview: input.editorPreview });

  let grammar: LocaleUrlSettings = talentSiteUrlSettings(primary, supported);
  if (input.hrefMode !== "host-root") {
    const platform = await getLanguageSettingsPublicCached().catch(() => null);
    if (platform) grammar = localeUrlSettings(platform.defaultLocale, platform.publicLocales);
  }
  const chain = design.renderContentLocale.chain.length > 0 ? design.renderContentLocale.chain : [locale, primary];

  return {
    settings,
    locale,
    chain,
    contentLocale: design.renderContentLocale,
    grammar,
    switcherHrefs: talentSiteSwitcherHrefs(input.pagePath ?? "/", grammar, supported),
  };
}
