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
import { buildTalentLanguageRpcRows } from "@/lib/talent/talent-profile-shell-persistence";
// Types live in the sibling .types.ts — a "use server" file may ONLY export
// async functions; exporting `type` from here throws at runtime once a
// client component imports it (the DrawerLanguageRowInput ReferenceError).
import type {
  DrawerLanguageRowInput,
  TalentLanguageInput,
} from "./admin-talent-languages.types";

type Result = { ok: true } | { ok: false; error: string };

export async function saveTalentLanguages(input: {
  talent_profile_id: string;
  languages: DrawerLanguageRowInput[];
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

  const rows = buildTalentLanguageRpcRows(input.languages);

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

// ─── Immediate setAll for the LanguageSlotPanel (lossless + returns truth) ───
// Unlike saveTalentLanguages (name-keyed DrawerLanguageRowInput, re-derives
// language_code and defaults capability flags to false via
// buildTalentLanguageRpcRows), this takes the FULL row shape and passes it to
// replace_talent_languages verbatim — so exact language_code, display_order,
// is_native AND the capability flags (can_host/sell/translate/teach) survive
// even when the simplified V1 UI never shows them. Returns the final saved
// rows so the panel reconciles to server truth (the proven setAll contract).

const SPEAKING_LEVELS = [
  "basic",
  "conversational",
  "professional",
  "fluent",
  "native",
] as const;

export async function setTalentLanguages(input: {
  talent_profile_id: string;
  languages: TalentLanguageInput[];
}): Promise<
  { ok: true; languages: TalentLanguageInput[] } | { ok: false; error: string }
> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId, tenantSlug } = auth;
  const LOG = "[setLanguages]";
  const t0 = Date.now();

  const { data: roster, error: rErr } = await supabase
    .from("agency_talent_roster")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("talent_profile_id", input.talent_profile_id)
    .neq("status", "removed")
    .maybeSingle();
  if (rErr) {
    logServerError("setTalentLanguages.roster", rErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }
  if (!roster) return { ok: false, error: "That talent isn't on your roster." };

  // Validate + normalize each row. De-dupe by language_code (last wins).
  const byCode = new Map<
    string,
    {
      language_code: string;
      language_name: string;
      speaking_level: string;
      is_native: boolean;
      can_host: boolean;
      can_sell: boolean;
      can_translate: boolean;
      can_teach: boolean;
      display_order: number;
    }
  >();
  let order = 0;
  for (const l of input.languages) {
    const code = (l.language_code ?? "").trim().toLowerCase();
    const name = (l.language_name ?? "").trim();
    if (!code || !name) {
      return { ok: false, error: "Each language needs a code and a name." };
    }
    const level = SPEAKING_LEVELS.includes(
      l.speaking_level as (typeof SPEAKING_LEVELS)[number],
    )
      ? l.speaking_level
      : "conversational";
    byCode.set(code, {
      language_code: code,
      language_name: name,
      speaking_level: level,
      is_native: l.is_native ?? level === "native",
      can_host: l.can_host ?? false,
      can_sell: l.can_sell ?? false,
      can_translate: l.can_translate ?? false,
      can_teach: l.can_teach ?? false,
      display_order: l.display_order ?? order++,
    });
  }
  const rows = [...byCode.values()];
  console.info(
    `${LOG} start talent=${input.talent_profile_id} tenant=${tenantId} desired=${rows.length}`,
  );

  const { error: rpcErr } = await supabase.rpc("replace_talent_languages", {
    p_talent_profile_id: input.talent_profile_id,
    p_tenant_id: tenantId,
    p_rows: rows,
  });
  if (rpcErr) {
    logServerError("setTalentLanguages.replace", rpcErr);
    console.warn(`${LOG} FAIL replace code=${rpcErr.code}`);
    return {
      ok: false,
      error: "Couldn't save languages. No changes were applied.",
    };
  }

  revalidatePath(`/${tenantSlug}/admin/roster`, "page");

  const final = await getTalentLanguages({
    talent_profile_id: input.talent_profile_id,
  });
  if (!final.ok) {
    console.warn(`${LOG} FAIL final-fetch (writes applied)`);
    return {
      ok: false,
      error:
        "Languages were saved, but the list couldn't be reloaded — reopen the profile to confirm.",
    };
  }
  console.info(
    `${LOG} done talent=${input.talent_profile_id} final=${final.languages.length} ms=${Date.now() - t0}`,
  );
  return { ok: true, languages: final.languages };
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
