import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedClientLinks =
  | { ok: true; accountId: string | null; contactId: string | null }
  | { ok: false; error: string };

/**
 * Ensures contact belongs to the chosen account when both are set.
 * If only a contact is selected, aligns `client_account_id` to that contact's account.
 */
export async function resolveClientAccountContactForSave(
  supabase: SupabaseClient,
  accountId: string | null,
  contactId: string | null,
): Promise<ResolvedClientLinks> {
  if (!contactId) {
    return { ok: true, accountId, contactId: null };
  }

  const { data: contact, error } = await supabase
    .from("client_account_contacts")
    .select("id, client_account_id")
    .eq("id", contactId)
    .is("archived_at", null)
    .maybeSingle();

  if (error || !contact) {
    return { ok: false, error: "That contact is invalid or archived." };
  }

  if (!accountId) {
    return { ok: true, accountId: contact.client_account_id, contactId };
  }

  if (accountId !== contact.client_account_id) {
    return {
      ok: false,
      error: "Selected contact does not belong to the selected Client Location.",
    };
  }

  return { ok: true, accountId, contactId };
}
