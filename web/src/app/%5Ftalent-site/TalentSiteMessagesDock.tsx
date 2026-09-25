import "server-only";

import { TalentProfileChatLauncherMount } from "@/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount";
import { createTranslator } from "@/i18n/messages";
import { loadTalentSiteInquiryTenant } from "@/lib/messaging/talent-inquiry-tenant.server";
import {
  talentContactHrefs,
  talentOffersInstantBooking,
} from "@/lib/talent-site/contact-channels";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { resolveIndustryPreset, talentSiteChatVoice } from "@/lib/words/presets";
import { resolveTalentTradePreset } from "@/lib/words/talent-trade-preset";

import { TalentSiteContactBridge } from "./TalentSiteContactBridge";

/**
 * Guest Messages dock for a talent vanity host. The tenant is resolved on
 * the server from the talent profile id and passed into the mount for
 * server-side reads only. `exposeTenantToClient={false}` keeps that id out
 * of the client bundle; guest actions re-read the host header.
 *
 * THIS HOST IS HERS, SO THE VOICE AND THE NAME ARE HERS (D-MSG-430).
 * This mount used to hand the dock the INQUIRY TENANT'S display name and no
 * voice at all. A free talent's inquiry tenant is the platform hub, so a lash
 * artist's own booking page launched "Message Tulala", headed the panel
 * "Tulala", and — with no greeting and no preset reaching
 * `GuestDockHomeView` — fell through to the catalog opener that asks about an
 * event and a talent lineup. The fallback was not the defect; this caller
 * never supplying the real values was. Three things now come from the talent:
 *   - `agencyName` is her display name, which drives the launcher label and the
 *     panel header. On her host there is no other business to name.
 *   - `wordsPresetOverride` is her trade, rolled up from
 *     `service_category_slug`, which drives the catalog tab label and whether
 *     the dock talks about people at all.
 *   - `greeting` is that preset's chat voice, so the opener speaks her trade.
 * A talent whose trade the taxonomy does not know resolves to null and keeps the
 * tenant's preset, exactly as before.
 */
export async function TalentSiteMessagesDock({
  talentProfileId,
  locale,
}: {
  talentProfileId: string;
  locale: string;
}) {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const [resolved, profileRes] = await Promise.all([
    loadTalentSiteInquiryTenant(admin, talentProfileId),
    admin
      .from("talent_profiles")
      .select(
        "profile_code, display_name, phone, phone_e164, social_links, talent_plan_key, service_category_slug",
      )
      .eq("id", talentProfileId)
      .maybeSingle(),
  ]);
  if (!resolved.ok) return null;
  const profile = profileRes.data as {
    profile_code: string | null;
    display_name: string | null;
    phone: string | null;
    phone_e164: string | null;
    social_links: unknown;
    talent_plan_key: string | null;
    service_category_slug: string | null;
  } | null;
  const code = profile?.profile_code?.trim();
  if (!code) return null;
  const displayName = profile?.display_name?.trim() || code;
  const hrefs = talentContactHrefs({
    phone: profile?.phone,
    phoneE164: profile?.phone_e164,
    socialLinks: profile?.social_links,
  });
  const t = createTranslator(locale);
  const instant = talentOffersInstantBooking(profile?.talent_plan_key);

  // Her trade, or null when the taxonomy does not know it (most profiles carry
  // no category). A null leaves the tenant preset in place.
  const tradePreset = await resolveTalentTradePreset(admin, profile?.service_category_slug);
  // "custom" is the pre-preset default and is not a voice (the agency mount
  // makes the same exclusion), so it must not become an opener.
  const tradeVoice =
    tradePreset && tradePreset !== "custom"
      ? talentSiteChatVoice(
          resolveIndustryPreset(tradePreset),
          locale === "es" ? "es" : "en",
        )
      : null;

  return (
    <>
      <TalentSiteContactBridge
        heading={t("public.talentSite.contact.heading")}
        askLabel={t("public.talentSite.contact.ask")}
        whatsappLabel={t("public.talentSite.contact.whatsapp")}
        emailLabel={t("public.talentSite.contact.email")}
        truth={t(
          instant
            ? "public.talentSite.contact.bookInstant"
            : "public.talentSite.contact.confirmByHand",
        )}
        whatsappHref={hrefs.whatsappHref}
        emailHref={hrefs.emailHref}
      />
      <TalentProfileChatLauncherMount
        talentProfileId={talentProfileId}
        talentProfileCode={code}
        talentDisplayName={displayName}
        tenantSlug={resolved.tenant.slug}
        tenantId={resolved.tenant.tenantId}
        exposeTenantToClient={false}
        agencyName={displayName}
        sourcePage="/"
        locale={locale}
        greeting={tradeVoice}
        wordsPresetOverride={tradePreset}
        omitPlatformBrand
      />
    </>
  );
}
