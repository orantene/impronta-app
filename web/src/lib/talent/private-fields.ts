/**
 * TUL-1269: the seven private `talent_profiles` columns are NOT column-granted
 * to `authenticated` (held migration 20261231424900). A user-session client can
 * no longer select them, name them in a filter, or RETURN them. Owners and
 * roster staff read them through the SECURITY DEFINER RPC
 * `talent_private_fields(p_talent_id)`, which returns a row only for the owner
 * (user_id = auth.uid()) or staff who pass `staff_can_access_talent_profile`.
 *
 * Service-role code does not need this helper; it keeps selecting the columns.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const TALENT_PRIVATE_COLUMNS = [
  "phone",
  "phone_e164",
  "date_of_birth",
  "legal_name",
  "stripe_account_id",
  "gp_recipient_account_id",
  "ai_search_document",
] as const;

export type TalentPrivateColumn = (typeof TALENT_PRIVATE_COLUMNS)[number];

export type TalentPrivateFields = Record<TalentPrivateColumn, string | null>;

export const EMPTY_TALENT_PRIVATE_FIELDS: TalentPrivateFields = {
  phone: null,
  phone_e164: null,
  date_of_birth: null,
  legal_name: null,
  stripe_account_id: null,
  gp_recipient_account_id: null,
  ai_search_document: null,
};

type RpcCaller = Pick<SupabaseClient, "rpc">;

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/**
 * Load the private fields of one talent for the signed-in caller. Returns null
 * when the caller is neither the owner nor staff of the talent (the RPC returns
 * no row) and on any RPC error, so callers fail closed to "no private data".
 */
export async function loadTalentPrivateFields(
  supabase: RpcCaller,
  talentProfileId: string,
): Promise<TalentPrivateFields | null> {
  const { data, error } = await supabase.rpc("talent_private_fields", { p_talent_id: talentProfileId });
  if (error || data == null) return null;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return null;
  const out: TalentPrivateFields = { ...EMPTY_TALENT_PRIVATE_FIELDS };
  for (const c of TALENT_PRIVATE_COLUMNS) out[c] = asString(row[c]);
  return out;
}
