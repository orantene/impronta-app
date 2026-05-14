"use server";

/**
 * getTalentProfileInquireData — server action called by TalentProfileInquireButton.
 *
 * Returns the minimal payload the inline inquiry drawer needs: pov (client vs guest),
 * event types, default client fields, WhatsApp number, and AI-draft flag.
 * Mirrors the pattern of getDirectoryInquirySheetData but scoped to the /t/* surface.
 *
 * Step 10 of the inquiry-funnel sprint (2026-05-13).
 */

import { getPublicSettings } from "@/lib/public-settings";
import { isResolvedAiChatConfigured } from "@/lib/ai/resolve-provider";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

export type TalentProfileInquirePayload = {
  pov: "client" | "guest";
  eventTypes: Array<{ id: string; name_en: string }>;
  agencyWhatsAppNumber?: string;
  aiInquiryDraftEnabled: boolean;
  defaultEmail?: string;
  defaultName?: string;
  defaultPhone?: string;
  defaultCompany?: string;
};

export async function getTalentProfileInquireData(): Promise<TalentProfileInquirePayload> {
  const pub = isSupabaseConfigured() ? createPublicSupabaseClient() : null;

  const [publicSettings, actor, aiFlags] = await Promise.all([
    getPublicSettings(),
    getCachedActorSession(),
    getAiFeatureFlags(),
  ]);

  const aiInquiryDraftEnabled = Boolean(
    aiFlags.ai_master_enabled &&
      aiFlags.ai_draft_enabled &&
      (await isResolvedAiChatConfigured()),
  );

  const user = actor.user;
  const supabase = actor.supabase;

  // Fetch client profile defaults if logged in.
  const { data: clientProfile } =
    user && supabase
      ? await supabase
          .from("client_profiles")
          .select("company_name, phone")
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };

  // Fetch event types from the public client.
  const { data: eventTypes } = pub
    ? await pub
        .from("taxonomy_terms")
        .select("id, name_en")
        .eq("kind", "event_type")
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
    : { data: [] as Array<{ id: string; name_en: string }> };

  const defaultEmail = user?.email ?? undefined;
  const defaultName =
    actor.profile?.display_name ??
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    undefined;

  return {
    pov: user ? "client" : "guest",
    eventTypes: eventTypes ?? [],
    agencyWhatsAppNumber: publicSettings.agencyWhatsAppNumber ?? undefined,
    aiInquiryDraftEnabled,
    defaultEmail,
    defaultName,
    defaultPhone: clientProfile?.phone ?? undefined,
    defaultCompany: clientProfile?.company_name ?? undefined,
  };
}
