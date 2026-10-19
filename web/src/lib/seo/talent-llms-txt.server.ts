import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";
import { loadMaxSiteByProfileId, loadTalentPlanKey } from "@/lib/talent-site/server/load-max-site";
import { loadMaxSiteSeoFacts } from "@/lib/talent-site/server/max-site-seo-facts.server";
import { loadTalentTypeLabels } from "@/lib/talent-site/server/load-talent-trades.server";
import { buildTalentLlmsTxt, isTalentLlmsEligible, talentServicePriceText, type TalentLlmsPost } from "./talent-llms-txt";

/** The llms.txt body for a talent-site host, or null (404) when not public. */
export async function loadTalentLlmsTxt(
  talentProfileId: string,
  base: URL,
  posts: TalentLlmsPost[] = [],
): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  try {
    const { data: p, error } = await admin
      .from("talent_profiles")
      .select("display_name, first_name, deleted_at, is_publicly_hidden, profile_kind, is_demo")
      .eq("id", talentProfileId)
      .maybeSingle();
    if (error || !p) return null;
    const [site, planKey] = await Promise.all([
      loadMaxSiteByProfileId(talentProfileId),
      loadTalentPlanKey(talentProfileId),
    ]);
    const row = p as {
      display_name: string | null; first_name: string | null; deleted_at: string | null;
      is_publicly_hidden: boolean | null; profile_kind: string | null; is_demo: boolean | null;
    };
    const eligible = isTalentLlmsEligible({
      deletedAt: row.deleted_at,
      isPubliclyHidden: row.is_publicly_hidden !== false,
      profileKind: row.profile_kind,
      isDemo: row.is_demo === true,
      sitePublishedAt: site?.sitePublishedAt ?? null,
      planKey: planKey ?? null,
    });
    const name = row.display_name?.trim() || row.first_name?.trim() || "";
    if (!eligible || !name) return null;
    const [facts, trades, langs, switches] = await Promise.all([
      loadMaxSiteSeoFacts(talentProfileId, "en"),
      loadTalentTypeLabels(talentProfileId),
      admin
        .from("talent_languages")
        .select("language_name")
        .eq("talent_profile_id", talentProfileId)
        .order("display_order", { ascending: true }),
      loadTalentSiteSwitches(admin, talentProfileId),
    ]);
    return buildTalentLlmsTxt(base, {
      name,
      trade: trades[0] ?? null,
      city: facts.addressLocality,
      posts,
      agentBookingEnabled: switches.chatConfig.agentBookingEnabled === true,
      languages: ((langs.data ?? []) as { language_name: string | null }[])
        .map((l) => l.language_name?.trim() ?? "")
        .filter(Boolean),
      services: facts.services.map((s) => ({
        title: s.name,
        priceText: talentServicePriceText(s),
      })),
    });
  } catch (err) {
    logServerError("talentLlmsTxt", err);
    return null;
  }
}
