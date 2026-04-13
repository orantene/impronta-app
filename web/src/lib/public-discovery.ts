import { getGuestSessionKey } from "@/lib/guest-session";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function getSavedTalentIds(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const pub = createPublicSupabaseClient();
  if (!pub) return [];

  const guestKey = await getGuestSessionKey();
  if (guestKey) {
    await pub.rpc("ensure_guest_session", { p_session_key: guestKey });
  }

  const supabase = await createClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: saves } = await supabase
        .from("saved_talent")
        .select("talent_profile_id")
        .eq("client_user_id", user.id)
        .order("created_at", { ascending: false });
      return saves?.map((save) => save.talent_profile_id) ?? [];
    }
  }

  if (!guestKey) return [];

  const { data: guestRows } = await pub.rpc("guest_list_saved_talent_ids", {
    p_session_key: guestKey,
  });

  return (
    (guestRows as { talent_profile_id: string }[] | null)?.map(
      (row) => row.talent_profile_id,
    ) ?? []
  );
}
