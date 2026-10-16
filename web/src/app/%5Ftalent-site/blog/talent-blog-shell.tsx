/**
 * Talent-site blog chrome (Posts v1, TUL-1009): renders a post / category /
 * unavailable body INSIDE the talent's published site shell and theme via
 * `renderTalentMaxSite({ mainOverride })`, the same hook the policy and
 * service pages use. Same docks as the `[[...pageSlug]]` host route.
 */
import type { ReactNode } from "react";
import { headers } from "next/headers";

import { ClientAccountDock } from "@/components/client-account/ClientAccountDock";
import { DocumentLang } from "@/components/i18n/DocumentLang";
import { TalentSiteHostFullNav } from "@/components/talent-site/talent-site-host-full-nav";
import { HOST_NAME_HEADER } from "@/lib/saas/host-context";
import type { PostSiteContext } from "@/lib/cms/posts-public-site";
import { renderTalentMaxSite } from "@/lib/talent-site/server/render-max-site";
import { TalentSiteMessagesDock } from "../TalentSiteMessagesDock";

/** Null when the talent's site itself does not render publicly (closed gate) → caller 404s. */
export async function renderTalentBlogShell(
  site: PostSiteContext,
  locale: string,
  canonicalPath: string,
  body: ReactNode,
): Promise<ReactNode | null> {
  if (site.scope.kind !== "talent") return null;
  const talentProfileId = site.scope.talentProfileId;
  let servedHost: string | undefined;
  try {
    servedHost = (await headers()).get(HOST_NAME_HEADER)?.trim() || undefined;
  } catch {
    servedHost = undefined;
  }
  const result = await renderTalentMaxSite({
    talentProfileId,
    pageSlug: null,
    locale,
    hrefMode: "host-root",
    canonicalOrigin: site.origin,
    canonicalPath,
    mainOverride: body,
  });
  if (result.kind !== "render") return null;
  return (
    <>
      <DocumentLang locale={result.locale} />
      {servedHost ? <TalentSiteHostFullNav servedHost={servedHost} /> : null}
      {result.node}
      <TalentSiteMessagesDock talentProfileId={talentProfileId} locale={result.locale} orderId={null} />
      <ClientAccountDock locale={result.locale} />
    </>
  );
}
