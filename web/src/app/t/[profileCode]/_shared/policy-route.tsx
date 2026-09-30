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
import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicPathPrefix } from "@/lib/saas/scope";
import { publicSiteMetadataBase } from "@/lib/seo/locale-alternates";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { POLICY_SLUG, type PolicyDoc } from "@/lib/talent-policies/public";
import { loadTalentPolicyModel, policyMainNode } from "@/lib/talent-site/server/policy-main";
import { renderTalentMaxSite } from "@/lib/talent-site/server/render-max-site";
import { maxSiteSeoToMetadata } from "@/lib/talent-site/server/site-metadata";

async function talentIdForCode(profileCode: string): Promise<string | null> {
  const pub = createPublicSupabaseClient();
  if (!pub) return null;
  const { data, error } = await pub
    .from("talent_profiles")
    .select("id")
    .eq("profile_code", profileCode)
    .neq("profile_kind", "resource")
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

function policyPath(profileCode: string, doc: PolicyDoc): string {
  return `/t/${encodeURIComponent(profileCode)}/${POLICY_SLUG[doc]}`;
}

export async function talentProfilePolicyMetadata(profileCode: string, doc: PolicyDoc): Promise<Metadata> {
  if (!isSupabaseConfigured()) return {};
  const [locale, talentProfileId] = await Promise.all([getRequestLocale(), talentIdForCode(profileCode)]);
  if (!talentProfileId) return { title: "Not found" };
  const model = await loadTalentPolicyModel(talentProfileId, doc, locale);
  const path = policyPath(profileCode, doc);
  return maxSiteSeoToMetadata({ title: model.title, noindex: false }, { localePathWithoutLocale: path, locale });
}

export async function TalentProfilePolicyPage({ profileCode, doc }: { profileCode: string; doc: PolicyDoc }) {
  if (!isSupabaseConfigured()) notFound();
  const talentProfileId = await talentIdForCode(profileCode);
  if (!talentProfileId) notFound();
  const [locale, publicPathPrefix] = await Promise.all([getRequestLocale(), getPublicPathPrefix()]);

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
  return (
    <div
      data-talent-policy-standalone=""
      style={{ minHeight: "100vh", backgroundColor: "var(--token-color-background, Canvas)", color: "var(--token-color-ink, CanvasText)" }}
    >
      <SkipToContent />
      <PublicHeader />
      <main id="main-content">{policyMainNode(model)}</main>
    </div>
  );
}
