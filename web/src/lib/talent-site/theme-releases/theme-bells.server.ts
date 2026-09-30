import "server-only";

/**
 * THEME RELEASES (F127): one bell entry per design.
 *   - a NEWER release's bell marks the older unread ones for the same design read
 *   - closing update rows (applied, dismissed, nothing_applicable) marks their
 *     release's bell read
 * The bell opens `/talent/site?themeUpdate=open`, which shows the combined offer.
 * Best-effort: a failure here never fails the caller.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { BellRow } from "./manager/notify";

type BellPayload = { design?: string; toVersion?: number; releaseId?: string } | null;

async function markRead(admin: SupabaseClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() } as never)
    .in("id", ids);
  if (error) logServerError("themeBells.markRead", error);
}

async function unreadThemeBells(
  admin: SupabaseClient,
  userId: string,
): Promise<Array<{ id: string; origin_event_id: string; target_payload: BellPayload }>> {
  const { data, error } = await admin
    .from("user_notifications")
    .select("id, origin_event_id, target_payload")
    .eq("user_id", userId)
    .eq("origin_kind", "theme_release")
    .is("read_at", null);
  if (error) {
    logServerError("themeBells.read", error);
    return [];
  }
  return (data ?? []) as Array<{ id: string; origin_event_id: string; target_payload: BellPayload }>;
}

/** After new bells were inserted: older unread bells for the same design go read. */
export async function supersedeOlderBells(admin: SupabaseClient, bells: ReadonlyArray<BellRow>): Promise<void> {
  try {
    for (const b of bells) {
      const old = (await unreadThemeBells(admin, b.user_id)).filter(
        (r) =>
          r.origin_event_id !== b.origin_event_id &&
          r.target_payload?.design === b.target_payload.design &&
          typeof r.target_payload?.toVersion === "number" &&
          r.target_payload.toVersion < b.target_payload.toVersion,
      );
      await markRead(admin, old.map((r) => r.id));
    }
  } catch (err) {
    logServerError("themeBells.supersede", err);
  }
}

/** Closed update rows resolve their releases' bell entries. */
export async function resolveBellsForRows(admin: SupabaseClient, talentProfileId: string, rowIds: string[]): Promise<void> {
  if (rowIds.length === 0) return;
  try {
    const [rowsRes, profRes] = await Promise.all([
      admin.from("talent_site_theme_updates").select("release_id").in("id", rowIds).eq("talent_profile_id", talentProfileId),
      admin.from("talent_profiles").select("user_id").eq("id", talentProfileId).maybeSingle(),
    ]);
    const userId = (profRes.data as { user_id?: string } | null)?.user_id;
    if (rowsRes.error || profRes.error || !userId) return;
    const releaseIds = new Set(((rowsRes.data ?? []) as Array<{ release_id: string }>).map((r) => r.release_id));
    const mine = (await unreadThemeBells(admin, userId)).filter((r) => releaseIds.has(r.origin_event_id));
    await markRead(admin, mine.map((r) => r.id));
  } catch (err) {
    logServerError("themeBells.resolve", err);
  }
}
