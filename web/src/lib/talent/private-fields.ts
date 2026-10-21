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

/**
 * Outcome of a private-field load. `unavailable` is NOT "the fields are empty":
 * it means the RPC failed or returned no row, so the values are UNKNOWN. A save
 * path must then leave these fields out of its payload (see
 * {@link omitUnlessLoaded}); writing a default would blank real data.
 */
export type TalentPrivateFieldsResult =
  | { status: "loaded"; fields: TalentPrivateFields }
  | { status: "unavailable"; reason: "rpc_error" | "no_row" };

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
 * Load the private fields of one talent for the signed-in caller. Never returns
 * a blank stand-in: an RPC error or a missing row (caller is neither the owner
 * nor staff) is the explicit `unavailable` state.
 */
export async function loadTalentPrivateFields(
  supabase: RpcCaller,
  talentProfileId: string,
): Promise<TalentPrivateFieldsResult> {
  const { data, error } = await supabase.rpc("talent_private_fields", { p_talent_id: talentProfileId });
  if (error) return { status: "unavailable", reason: "rpc_error" };
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row) return { status: "unavailable", reason: "no_row" };
  const fields: TalentPrivateFields = { ...EMPTY_TALENT_PRIVATE_FIELDS };
  for (const c of TALENT_PRIVATE_COLUMNS) fields[c] = asString(row[c]);
  return { status: "loaded", fields };
}

export function privateFieldsLoaded(r: TalentPrivateFieldsResult): boolean {
  return r.status === "loaded";
}

/** Value of one private field, or null when the load was unavailable (display only, never for writes). */
export function privateFieldOrNull(r: TalentPrivateFieldsResult, col: TalentPrivateColumn): string | null {
  return r.status === "loaded" ? r.fields[col] : null;
}

/**
 * Drop the given private keys from a save payload unless the private fields were
 * loaded. A loaded-but-empty value (null phone) keeps its key, so it stays
 * writable; an unavailable load removes the keys so nothing is overwritten.
 */
export function omitUnlessLoaded<T extends Record<string, unknown>>(
  payload: T,
  loaded: boolean,
  keys: ReadonlyArray<keyof T & string>,
): Partial<T> {
  if (loaded) return payload;
  const out: Partial<T> = { ...payload };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * Keys of the identity save payload (`updateTalentIdentitySchema`) that carry a
 * private column: legal_name, date_of_birth and the phone pair
 * (`contact_phone` + `contact_phone_prefix` -> talent_profiles.phone).
 */
export const PRIVATE_IDENTITY_PAYLOAD_KEYS = [
  "legal_name",
  "date_of_birth",
  "contact_phone",
  "contact_phone_prefix",
] as const;
