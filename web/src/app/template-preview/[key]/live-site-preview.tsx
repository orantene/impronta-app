/**
 * LiveSitePreview: the `kind=live-site` branch of the shared template-preview
 * route. Renders the signed-in owner's CURRENT published talent site, same
 * origin, so the My website live card can show a real thumbnail for any live
 * site (including sites built by hand before the design catalog, which have no
 * `theme_design_slug`). The vanity domain refuses framing and /t/site 308s to
 * it, so this is the only way the app host can frame the live site.
 *
 * URL: /template-preview/current?kind=live-site&talent=<profileId>
 *
 * Read-only: the published shell + home page through the SAME
 * `renderTalentMaxSite` path the live host uses (header, page, footer order;
 * public gate; never the draft). Owner-only: `requireTalentSelf` must resolve
 * to the requested profile, anything else is a 404. Never indexed (the route
 * metadata sets noindex).
 */
import { notFound } from "next/navigation";

import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { renderTalentMaxSite } from "@/lib/talent-site/server/render-max-site";
import { TalentOfferingIntentQuery } from "@/app/%5Ftalent-site/TalentOfferingIntentQuery";
import { TalentSiteMessagesDock } from "@/app/%5Ftalent-site/TalentSiteMessagesDock";

export async function LiveSitePreview({
  talentProfileId,
  locale,
}: {
  talentProfileId: string | null | undefined;
  locale: "en" | "es";
}) {
  const id = talentProfileId?.trim();
  if (!id) notFound();
  const scope = await requireTalentSelf();
  if (!scope.ok || scope.talentProfile.id !== id) notFound();

  const result = await renderTalentMaxSite({
    talentProfileId: id,
    locale,
    hrefMode: "host-root",
    previewDraft: false,
  });
  if (result.kind !== "render") notFound();
  // Same chat mount as the vanity host, so the dock's chat button opens the
  // real panel here too (and the design harness can measure its open state).
  return (
    <>
      {result.node}
      <TalentOfferingIntentQuery />
      <TalentSiteMessagesDock talentProfileId={id} locale={locale} />
    </>
  );
}
