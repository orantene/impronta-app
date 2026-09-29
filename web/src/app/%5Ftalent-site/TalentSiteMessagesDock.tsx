import "server-only";

import { TalentProfileChatLauncherMount } from "@/app/t/[profileCode]/_chat/TalentProfileChatLauncherMount";
import { GUEST_CHAT_LAUNCHER_CLEARANCE_CSS } from "@/app/t/[profileCode]/_chat/launcher-clearance";
import { createTranslator } from "@/i18n/messages";
import { loadTalentSiteInquiryTenant } from "@/lib/messaging/talent-inquiry-tenant.server";
import {
  talentContactHrefs,
  talentOffersInstantBooking,
} from "@/lib/talent-site/contact-channels";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { loadTalentCardThumbs } from "@/app/(workspace)/[tenantSlug]/_data-bridge/talent-card-thumbs";
import { resolveIndustryPreset, talentSiteChatVoice } from "@/lib/words/presets";
import { resolveTalentTradePreset } from "@/lib/words/talent-trade-preset";

import { TalentInquiryFormSheet } from "@/app/t/[profileCode]/_chat/TalentInquiryFormSheet";
import {
  askEntryPointsVisible,
  dockMounted,
  intakeNoticeCopy,
  intakeNoticeKind,
  resolveTalentAskEntry,
  resolveTalentChatGreeting,
} from "@/lib/talent/chat-entry";
import { TalentIntakeNotice } from "@/app/t/[profileCode]/_chat/TalentIntakeNotice";
import { getActiveGuestInquiry } from "@/app/t/[profileCode]/_actions/guest-chat-actions";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";

import { TalentSiteContactBridge } from "./TalentSiteContactBridge";
import {
  chatCardColorsFromTokens,
  chatCardReplyKey,
  resolveChatVariant,
  type ChatCardConfig,
} from "@/lib/talent-site/chat-card";
import { getTypicalReplyLabel } from "@/lib/inquiry/guest-reply-latency";
import { interpolate } from "@/i18n/interpolate";

/** Honest reply time for the chat card subline; null without real data. */
async function chatCardReplyLabel(
  tenantId: string | null,
  talentProfileId: string,
  t: (key: string) => string,
): Promise<string | null> {
  if (!tenantId) return null;
  const hit = chatCardReplyKey(await getTypicalReplyLabel({ tenantId, talentProfileId }));
  if (!hit) return null;
  return interpolate(t(hit.key), { n: String(hit.n ?? "") });
}

function localizedName(raw: unknown, locale: string): string | null {
  if (!raw || typeof raw !== "object") return null;
  const names = raw as Record<string, unknown>;
  const pick = [locale, "es", "en"].map((k) => names[k]).find((v) => typeof v === "string" && v.trim());
  return typeof pick === "string" ? pick.trim() : null;
}

/**
 * Solid CTA/brand fill for Hablar — prefer primary over pale accent blush.
 * Reads `talent_sites.design_tokens` even when TALENT_THEME_GALLERY_ENABLED is
 * off: the published CSS vars still carry color.primary (Jorg #A82458).
 */
async function loadVanitySiteChrome(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  talentProfileId: string,
): Promise<{
  accentColor: string | null;
  logoUrl: string | null;
  tokens: Record<string, unknown> | null;
  designSlug: string | null;
}> {
  const { data, error } = await admin
    .from("talent_sites")
    .select("design_tokens, logo_url, theme_design_slug")
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) return { accentColor: null, logoUrl: null, tokens: null, designSlug: null };
  const row = data as {
    design_tokens?: unknown;
    logo_url?: string | null;
    theme_design_slug?: string | null;
  } | null;
  // AUD-039: the same `talent_sites.logo_url` the Max-site shell header paints.
  const logoUrl = row?.logo_url?.trim() || null;
  const raw = row?.design_tokens;
  const tokens =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  return {
    accentColor: accentFromDesignTokens(raw),
    logoUrl,
    tokens,
    designSlug: row?.theme_design_slug?.trim() || null,
  };
}

function accentFromDesignTokens(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const tokens = raw as Record<string, unknown>;
  const primary = typeof tokens["color.primary"] === "string" ? tokens["color.primary"].trim() : "";
  if (primary && !isNearInk(primary)) return primary;
  const accent = typeof tokens["color.accent"] === "string" ? tokens["color.accent"].trim() : "";
  if (accent && !isPaleTint(accent) && !isNearInk(accent)) return accent;
  return primary || accent || null;
}

function isNearInk(hex: string): boolean {
  const n = parseHex(hex);
  if (!n) return false;
  return (n.r + n.g + n.b) / 3 < 40;
}

/** Blush/tint accents fail white-on-fill contrast for the Hablar pill. */
function isPaleTint(hex: string): boolean {
  const n = parseHex(hex);
  if (!n) return false;
  const lum = (0.299 * n.r + 0.587 * n.g + 0.114 * n.b) / 255;
  return lum > 0.72;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.trim().replace(/^#/, "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

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
 * A talent whose trade the taxonomy does not know defaults to the solo salon
 * voice ("Agenda una cita o pregúntame") — never the hub agency lineup voice
 * (AUD-028).
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
  const [resolved, profileRes, siteChrome, thumbs, switches] = await Promise.all([
    loadTalentSiteInquiryTenant(admin, talentProfileId),
    admin
      .from("talent_profiles")
      .select(
        "profile_code, display_name, phone, phone_e164, social_links, talent_plan_key, service_category_slug, residence_city:locations!residence_city_id ( display_name_i18n )",
      )
      .eq("id", talentProfileId)
      .maybeSingle(),
    loadVanitySiteChrome(admin, talentProfileId),
    // AUD-039: the talent's profile photo, same rank as her directory card.
    loadTalentCardThumbs(admin, [talentProfileId]),
    // WSF D: her chat switch (chat → dock, off → inquiry form, inquiries off → neither).
    loadTalentSiteSwitches(admin, talentProfileId),
  ]);
  // §8 "Existing clients": a visitor with a live thread keeps the dock.
  const resume =
    resolved.ok && !(switches.chatEnabled && switches.acceptingInquiries)
      ? await getActiveGuestInquiry({ tenantSlug: resolved.tenant.slug, talentProfileId })
      : null;
  const askEntry = resolveTalentAskEntry(switches, {
    hasActiveThread: Boolean(resume?.ok && resume.active),
  });
  const noticeKind = intakeNoticeKind(askEntry);
  const { accentColor, logoUrl } = siteChrome;
  const photoUrl = thumbs.get(talentProfileId) ?? null;
  if (!resolved.ok) return null;
  const profile = profileRes.data as {
    profile_code: string | null;
    display_name: string | null;
    phone: string | null;
    phone_e164: string | null;
    social_links: unknown;
    talent_plan_key: string | null;
    service_category_slug: string | null;
    residence_city: { display_name_i18n: unknown } | null;
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

  // Her trade, or the solo salon default when the taxonomy does not know it
  // (most profiles carry no category). Never fall through to the hub "agency"
  // voice — that asks about an event and a talent lineup on her own site.
  const resolvedTrade = await resolveTalentTradePreset(admin, profile?.service_category_slug);
  const tradePreset =
    resolvedTrade && resolvedTrade !== "custom" ? resolvedTrade : "salon_barber";
  const tradeVoice = talentSiteChatVoice(
    resolveIndustryPreset(tradePreset),
    locale === "es" ? "es" : "en",
  );

  // `chat.variant`: the Design's default, overridden by the site token.
  const chatCard: ChatCardConfig | null =
    resolveChatVariant(siteChrome.tokens, siteChrome.designSlug) === "card"
      ? {
          replyLabel: await chatCardReplyLabel(resolved.tenant.tenantId, talentProfileId, t),
          city: localizedName(profile?.residence_city?.display_name_i18n, locale),
          customGreeting: switches.chatConfig.greeting ?? null,
          ...chatCardColorsFromTokens(siteChrome.tokens),
        }
      : null;

  return (
    <>
      <TalentSiteContactBridge
        heading={t("public.talentSite.contact.heading")}
        askLabel={t("public.talentSite.contact.ask")}
        showAsk={askEntryPointsVisible(askEntry)}
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
      {/* AUD-037: keep the last row CTA clear of the fixed launcher on phones. */}
      <style>{GUEST_CHAT_LAUNCHER_CLEARANCE_CSS}</style>
      {dockMounted(askEntry) ? (
        <TalentProfileChatLauncherMount
          talentProfileId={talentProfileId}
          talentProfileCode={code}
          talentDisplayName={displayName}
          tenantSlug={resolved.tenant.slug}
          tenantId={resolved.tenant.tenantId}
          exposeTenantToClient={false}
          agencyName={displayName}
          accentColor={accentColor}
          logoUrl={logoUrl}
          photoUrl={photoUrl}
          sourcePage="/"
          locale={locale}
          greeting={resolveTalentChatGreeting(switches, tradeVoice)}
          wordsPresetOverride={tradePreset}
          omitPlatformBrand
          chatCard={chatCard}
        />
      ) : askEntry === "form" ? (
        <TalentInquiryFormSheet
          tenantSlug={resolved.tenant.slug}
          talentProfileId={talentProfileId}
          talentProfileCode={code}
          talentName={displayName}
          sourcePage="/"
          locale={locale}
          accentColor={accentColor}
        />
      ) : null}
      {noticeKind ? (
        <TalentIntakeNotice
          text={intakeNoticeCopy(noticeKind, locale)}
          closeLabel={locale === "es" ? "Cerrar" : "Close"}
        />
      ) : null}
    </>
  );
}
