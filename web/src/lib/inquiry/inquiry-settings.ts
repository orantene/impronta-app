import type { SupabaseClient } from "@supabase/supabase-js";

export const INQUIRY_SETTING_KEYS = {
  INQUIRY_ENGINE_V2_ENABLED: "inquiry_engine_v2_enabled",
  DEFAULT_COORDINATOR_USER_ID: "default_coordinator_user_id",
  PLATFORM_COORDINATOR_USER_ID: "platform_coordinator_user_id",
  COORDINATOR_TIMEOUT_HOURS: "coordinator_timeout_hours",
  INQUIRY_EXPIRY_HOURS: "inquiry_expiry_hours",
  COORDINATOR_NUDGE_HOURS: "coordinator_nudge_hours",
  OFFER_NUDGE_HOURS: "offer_nudge_hours",
  TALENT_INVITE_NUDGE_HOURS: "talent_invite_nudge_hours",
  APPROVAL_NUDGE_HOURS: "approval_nudge_hours",
} as const;

function parseBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return fallback;
}

function parseIntSetting(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string") {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export async function getInquiryEngineV2Enabled(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", INQUIRY_SETTING_KEYS.INQUIRY_ENGINE_V2_ENABLED)
    .maybeSingle();
  return parseBool(data?.value, false);
}

export async function getCoordinatorTimeoutHours(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", INQUIRY_SETTING_KEYS.COORDINATOR_TIMEOUT_HOURS)
    .maybeSingle();
  return parseIntSetting(data?.value, 24);
}

export async function getInquiryExpiryHours(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", INQUIRY_SETTING_KEYS.INQUIRY_EXPIRY_HOURS)
    .maybeSingle();
  return parseIntSetting(data?.value, 72);
}
