/**
 * TUL-1335: a talent-side service delete re-checks history SERVER-SIDE and
 * ARCHIVES anything ever published or sold. Only a never-published, never-sold
 * row is hard-deleted.
 *
 * The history rule is copied 1:1 from the workspace side
 * (`offeringHasHistory` in menu-offerings-actions.ts): published now, or ever
 * published (`first_published_at`), or any `order_lines` / `talent_bookings`
 * row. A hard delete nulls `order_lines.offering_id`, so past orders would lose
 * what they were for. A failed history read fails CLOSED (counts as history).
 * The caller never passes a "force" flag: nothing here accepts one.
 *
 * Not a "use server" file: a pure function over an injected client, so tests
 * can drive it with a fake.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type OfferingRowForHistory = { status: string | null; first_published_at: string | null };

export type DeleteOrArchiveResult =
  | { ok: true; outcome: "deleted" | "archived" }
  | { ok: false; error: string };

/** True when the item was ever published or sold. Fails CLOSED on a read error. */
export async function offeringHasHistory(
  admin: SupabaseClient,
  offeringId: string,
  row: OfferingRowForHistory,
  onError?: (err: unknown) => void,
): Promise<boolean> {
  if (row.status === "published" || row.first_published_at) return true;
  try {
    const [lines, bookings] = await Promise.all([
      admin.from("order_lines").select("id", { count: "exact", head: true }).eq("offering_id", offeringId),
      admin.from("talent_bookings").select("id", { count: "exact", head: true }).eq("offering_id", offeringId),
    ]);
    if (lines.error || bookings.error) {
      onError?.(lines.error ?? bookings.error);
      return true;
    }
    return (lines.count ?? 0) > 0 || (bookings.count ?? 0) > 0;
  } catch (err) {
    onError?.(err);
    return true;
  }
}

export async function deleteOrArchiveTalentOffering(
  admin: SupabaseClient,
  talentProfileId: string,
  offeringId: string,
  onError?: (scope: string, err: unknown) => void,
): Promise<DeleteOrArchiveResult> {
  const { data: row, error: rowErr } = await admin
    .from("talent_offerings")
    .select("id, status, first_published_at")
    .eq("id", offeringId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (rowErr) {
    onError?.("read", rowErr);
    return { ok: false, error: "Failed to delete." };
  }
  if (!row) return { ok: false, error: "This item was already removed. Reload the list." };
  const found = row as { status: string | null; first_published_at: string | null };

  if (await offeringHasHistory(admin, offeringId, found, (e) => onError?.("history", e))) {
    if (found.status === "archived") return { ok: true, outcome: "archived" };
    const { error } = await admin
      .from("talent_offerings")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", offeringId)
      .eq("talent_profile_id", talentProfileId);
    if (error) {
      onError?.("archive", error);
      return { ok: false, error: "Failed to archive." };
    }
    return { ok: true, outcome: "archived" };
  }

  const { error } = await admin
    .from("talent_offerings")
    .delete()
    .eq("id", offeringId)
    .eq("talent_profile_id", talentProfileId);
  if (error) {
    onError?.("delete", error);
    return { ok: false, error: "Failed to delete." };
  }
  return { ok: true, outcome: "deleted" };
}
