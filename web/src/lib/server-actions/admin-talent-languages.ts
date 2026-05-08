"use server";

// admin-talent-languages.ts
//
// Full-replace save for talent languages. The drawer's LanguagesEditor holds
// the complete ordered list; on every debounced save we delete the existing
// rows for this talent and insert the new set. A unique constraint on
// (talent_profile_id, language_code) prevents duplicates when the client
// sends the same list twice.

import { revalidatePath } from "next/cache";
import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type TalentLanguageInput = {
  language_code: string;   // ISO 639-1 e.g. "en", "es"
  language_name: string;   // display name e.g. "English"
  speaking_level: "basic" | "conversational" | "professional" | "fluent" | "native";
  is_native?: boolean;
  can_host?: boolean;
  can_sell?: boolean;
  can_translate?: boolean;
  can_teach?: boolean;
  display_order?: number;
};

type Result = { ok: true } | { ok: false; error: string };

/** Map the drawer's ProfileLanguage level string to the DB enum. */
function mapLevel(level: string | undefined): TalentLanguageInput["speaking_level"] {
  const map: Record<string, TalentLanguageInput["speaking_level"]> = {
    basic: "basic",
    conversational: "conversational",
    professional: "professional",
    fluent: "fluent",
    native: "native",
    // legacy aliases the drawer may produce
    intermediate: "conversational",
    advanced: "professional",
  };
  return map[level ?? ""] ?? "conversational";
}

/** ISO 639-1 code from display name. Best-effort; unknown names get a slug. */
const LANG_CODE: Record<string, string> = {
  english: "en", spanish: "es", french: "fr", italian: "it", german: "de",
  portuguese: "pt", dutch: "nl", russian: "ru", japanese: "ja", chinese: "zh",
  arabic: "ar", hindi: "hi", korean: "ko", turkish: "tr", polish: "pl",
  swedish: "sv", norwegian: "no", danish: "da", finnish: "fi", greek: "el",
  catalan: "ca", basque: "eu", galician: "gl", romanian: "ro", ukrainian: "uk",
  czech: "cs", hungarian: "hu", thai: "th", vietnamese: "vi", indonesian: "id",
  malay: "ms", hebrew: "he", persian: "fa",
};

function toCode(name: string): string {
  return LANG_CODE[name.toLowerCase().trim()] ?? name.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8);
}

export async function saveTalentLanguages(input: {
  talent_profile_id: string;
  languages: Array<{
    language: string;
    level?: string;
    canHost?: boolean;
    canSell?: boolean;
    canTranslate?: boolean;
    canTeach?: boolean;
  }>;
}): Promise<Result> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;

  // Roster guard.
  const { data: roster, error: rErr } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .neq("status", "removed")
    .maybeSingle();
  if (rErr) { logServerError("talent-languages.roster", rErr); return { ok: false, error: CLIENT_ERROR.update }; }
  if (!roster) return { ok: false, error: "That talent isn't on your roster." };

  const rows = input.languages.map((l, i) => ({
    language_code: toCode(l.language),
    language_name: l.language,
    speaking_level: mapLevel(l.level),
    is_native: mapLevel(l.level) === "native",
    can_host: l.canHost ?? false,
    can_sell: l.canSell ?? false,
    can_translate: l.canTranslate ?? false,
    can_teach: l.canTeach ?? false,
    display_order: i,
  }));

  // Use the atomic RPC so delete + insert run in one transaction.
  // A mid-request crash can no longer leave the talent with zero languages.
  const { error: rpcErr } = await supabase.rpc("replace_talent_languages", {
    p_talent_profile_id: input.talent_profile_id,
    p_tenant_id: tenantId,
    p_rows: rows,
  });
  if (rpcErr) { logServerError("talent-languages.replace", rpcErr); return { ok: false, error: CLIENT_ERROR.update }; }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");
  return { ok: true };
}

/** Read existing languages for a talent profile. Used to hydrate the drawer on open. */
export async function getTalentLanguages(input: {
  talent_profile_id: string;
}): Promise<{ ok: true; languages: TalentLanguageInput[] } | { ok: false; error: string }> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("talent_languages")
    .select("language_code, language_name, speaking_level, is_native, can_host, can_sell, can_translate, can_teach, display_order")
    .eq("talent_profile_id", input.talent_profile_id)
    .order("display_order");
  if (error) { logServerError("talent-languages.read", error); return { ok: false, error: CLIENT_ERROR.generic }; }

  return {
    ok: true,
    languages: (data ?? []).map((r: {
      language_code: string; language_name: string; speaking_level: string;
      is_native: boolean; can_host: boolean; can_sell: boolean;
      can_translate: boolean; can_teach: boolean; display_order: number;
    }) => ({
      language_code: r.language_code,
      language_name: r.language_name,
      speaking_level: r.speaking_level as TalentLanguageInput["speaking_level"],
      is_native: r.is_native,
      can_host: r.can_host,
      can_sell: r.can_sell,
      can_translate: r.can_translate,
      can_teach: r.can_teach,
      display_order: r.display_order,
    })),
  };
}
