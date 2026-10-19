import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { aiReadVerdict, isAiBotUserAgent, type AiReadVerdict } from "./ai-bot-gate";

/** Whose "IA puede leer mi sitio" switch applies: a workspace (agency_branding) or a talent site. */
export type AiAccessScope = { tenantId: string } | { talentProfileId: string };

/**
 * The stored switch: true/false as saved, true when the site has no row yet (the
 * platform default), null when it could not be read (fail closed upstream).
 */
export async function readAiAccessFlag(admin: SupabaseClient, scope: AiAccessScope): Promise<boolean | null> {
  try {
    const { data, error } =
      "tenantId" in scope
        ? await admin.from("agency_branding").select("ai_crawlers_allowed").eq("tenant_id", scope.tenantId).maybeSingle()
        : await admin.from("talent_sites").select("ai_crawlers_allowed").eq("talent_profile_id", scope.talentProfileId).maybeSingle();
    if (error) {
      logServerError("seo/ai-bot-gate/read", error);
      return null;
    }
    if (!data) return true;
    return (data as { ai_crawlers_allowed: boolean | null }).ai_crawlers_allowed !== false;
  } catch (err) {
    logServerError("seo/ai-bot-gate/read", err);
    return null;
  }
}

/**
 * The verdict for one request. The flag is read ONLY for an AI bot, so ordinary
 * visitors cost nothing and are never affected.
 */
export async function aiReadVerdictForRequest(
  admin: SupabaseClient,
  request: Request,
  scope: AiAccessScope,
): Promise<AiReadVerdict> {
  const ua = request.headers.get("user-agent");
  if (!isAiBotUserAgent(ua)) return "allow";
  return aiReadVerdict(ua, await readAiAccessFlag(admin, scope));
}
