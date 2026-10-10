/**
 * Shared body of `/t/[profileCode]/politicas` and `/t/[profileCode]/privacidad`.
 *
 * When the talent has a published site, the page renders inside that site's
 * shell and theme (same renderer as the talent host). Otherwise it renders
 * standalone with the platform header and neutral tokens: a policy is never a
 * 404 just because a site is unpublished.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicHeader } from "@/components/public-header";
import { SkipToContent } from "@/components/accessibility/skip-to-content";
import { headers } from "next/headers";

import { getLanguageSettingsPublicCached } from "@/lib/language-settings/get-language-settings";
import { localeUrlSettings, stripLocaleFromPathname } from "@/i18n/pathnames";
import { ORIGINAL_PATHNAME_HEADER } from "@/i18n/request-locale";
import { loadTalentLocaleSettings } from "@/lib/site-admin/server/talent-locale-settings";
import { getPublicPathPrefix } from "@/lib/saas/scope";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { choosePolicyLocale, POLICY_SLUG, type PolicyDoc } from "@/lib/talent-policies/public";
import { resolveOrRedirectTalentProfileCode } from "@/lib/talent/profile-code-redirect.server";
import { resolveTalentProfileCodeQuiet } from "@/lib/talent/profile-code-resolve.server";
import { loadTalentPolicyModel, policyMainNode } from "@/lib/talent-site/server/policy-main";
import { renderTalentMaxSite } from "@/lib/talent-site/server/render-max-site";
import { maxSiteSeoToMetadata } from "@/lib/talent-site/server/site-metadata";

async function talentIdForCode(
  profileCode: string,
  doc: PolicyDoc,
  opts?: { redirect?: boolean },
): Promise<string | null> {
  if (opts?.redirect) {
    const resolved = await resolveOrRedirectTalentProfileCode(profileCode, {
      pathname: `/t/${profileCode}/${POLICY_SLUG[doc]}`,
    });
    return resolved?.profileId ?? null;
  }
  const resolved = await resolveTalentProfileCodeQuiet(profileCode);
  return resolved?.profileId ?? null;
}

export type PolicySearchParams = Promise<{ locale?: string | string[] }>;

/** The talent's primary unless `/en/...` or `?locale=` says otherwise. */
async function resolvePolicyLocale(talentProfileId: string, searchParams: PolicySearchParams | undefined): Promise<string> {
  const [settings, h, query, platform] = await Promise.all([
    loadTalentLocaleSettings(talentProfileId),
    headers(),
    searchParams ?? Promise.resolve({} as { locale?: string | string[] }),
    getLanguageSettingsPublicCached(),
  ]);
  const original = h.get(ORIGINAL_PATHNAME_HEADER);
  const stripped = original ? stripLocaleFromPathname(original, localeUrlSettings(platform.defaultLocale, platform.publicLocales)) : null;
  return choosePolicyLocale({
    prefixLocale: stripped?.hasLocalePrefix ? stripped.locale : null,
    queryLocale: Array.isArray(query.locale) ? query.locale[0] : query.locale,
    primary: settings.defaultLocale,
    supported: settings.supportedLocales,
  });
}

function policyPath(profileCode: string, doc: PolicyDoc): string {
  return `/t/${encodeURIComponent(profileCode)}/${POLICY_SLUG[doc]}`;
}

export async function talentProfilePolicyMetadata(profileCode: string, doc: PolicyDoc, searchParams?: PolicySearchParams): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const talentProfileId = await talentIdForCode(profileCode, doc, { redirect: false });
  if (!talentProfileId) return { title: "Not found" };
  const locale = await resolvePolicyLocale(talentProfileId, searchParams);
  const model = await loadTalentPolicyModel(talentProfileId, doc, locale);
  const path = policyPath(profileCode, doc);
  return maxSiteSeoToMetadata({ title: model.title, noindex: false }, { localePathWithoutLocale: path, locale });
}

export async function TalentProfilePolicyPage({ profileCode, doc, searchParams }: { profileCode: string; doc: PolicyDoc; searchParams?: PolicySearchParams }) {
  if (!isSupabaseConfigured()) notFound();
  const talentProfileId = await talentIdForCode(profileCode, doc, { redirect: true });
  if (!talentProfileId) notFound();
  const [locale, publicPathPrefix] = await Promise.all([resolvePolicyLocale(talentProfileId, searchParams), getPublicPathPrefix()]);

  const themed = await renderTalentMaxSite({
    talentProfileId,
    pageSlug: POLICY_SLUG[doc],
    locale,
    publicPathPrefix,
    hrefMode: "path",
    canonicalOrigin: publicSiteMetadataBase().origin,
    canonicalPath: policyPath(profileCode, doc),
  });
  if (themed.kind === "render") return <>{themed.node}</>;

  const model = await loadTalentPolicyModel(talentProfileId, doc, locale);
  const homeHref = publicPathPrefix
    ? `${publicPathPrefix.replace(/\/+$/, "")}/`
    : `/t/${encodeURIComponent(profileCode)}`;
  return (
    <div
      data-talent-policy-standalone=""
      style={{ minHeight: "100vh", backgroundColor: "var(--token-color-background, Canvas)", color: "var(--token-color-ink, CanvasText)" }}
    >
      <SkipToContent locale={locale} />
      <PublicHeader />
      <main id="main-content">{policyMainNode(model, { homeHref })}</main>
    </div>
  );
}
