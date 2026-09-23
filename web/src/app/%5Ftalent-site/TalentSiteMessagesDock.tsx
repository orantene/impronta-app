import "server-only";

import { TalentProfileChatLauncherMount } from "@/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount";
import { createTranslator } from "@/i18n/messages";
import { loadTalentSiteInquiryTenant } from "@/lib/messaging/talent-inquiry-tenant.server";
import {
  talentContactHrefs,
  talentOffersInstantBooking,
} from "@/lib/talent-site/contact-channels";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { TalentSiteContactBridge } from "./TalentSiteContactBridge";

/**
 * Guest Messages dock for a talent vanity host. The tenant is resolved on
 * the server from the talent profile id and passed into the mount for
 * server-side reads only. `exposeTenantToClient={false}` keeps that id out
 * of the client bundle; guest actions re-read the host header.
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
      .select("profile_code, display_name, phone, phone_e164, social_links, talent_plan_key")
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
        agencyName={resolved.tenant.displayName}
        sourcePage="/"
        locale={locale}
      />
    </>
  );
}
