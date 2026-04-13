import { getGuestSessionKey } from "@/lib/guest-session";
import { getPublicSettings } from "@/lib/public-settings";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";

export type DirectoryInquiryOrderedTalent = {
  id: string;
  profile_code: string;
  display_name: string | null;
};

export type DirectoryInquiryPayload =
  | { kind: "unconfigured" }
  | {
      kind: "ready";
      inquiriesOpen: boolean;
      agencyWhatsAppNumber?: string;
      mode: "client" | "guest";
      defaultEmail?: string;
      defaultName?: string;
      defaultPhone?: string;
      defaultCompany?: string;
      talentIds: string[];
      orderedTalent: DirectoryInquiryOrderedTalent[];
      eventTypes: { id: string; name_en: string }[];
    };

/**
 * Shared loader for the public inquiry sheet (header panel).
 */
export async function loadDirectoryInquiryPayload(): Promise<DirectoryInquiryPayload> {
  if (!isSupabaseConfigured()) {
    return { kind: "unconfigured" };
  }

  const pub = createPublicSupabaseClient()!;
  const publicSettings = await getPublicSettings();
  const guestKey = await getGuestSessionKey();
  if (guestKey) {
    await pub.rpc("ensure_guest_session", { p_session_key: guestKey });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  const { data: profile } =
    user && supabase
      ? await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
      : { data: null };

  const { data: clientProfile } =
    user && supabase
      ? await supabase
          .from("client_profiles")
          .select("company_name, phone, whatsapp_phone, website_url, notes")
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };

  let talentIds: string[] = [];
  if (user && supabase) {
    const { data: saves } = await supabase
      .from("saved_talent")
      .select("talent_profile_id")
      .eq("client_user_id", user.id)
      .order("created_at", { ascending: false });
    talentIds = saves?.map((s) => s.talent_profile_id) ?? [];
  } else if (guestKey) {
    const { data: guestRows } = await pub.rpc("guest_list_saved_talent_ids", {
      p_session_key: guestKey,
    });
    talentIds =
      (guestRows as { talent_profile_id: string }[] | null)?.map(
        (r) => r.talent_profile_id,
      ) ?? [];
  }

  const { data: talentRows } =
    talentIds.length > 0
      ? await pub
          .from("talent_profiles")
          .select("id, profile_code, display_name")
          .in("id", talentIds)
      : { data: [] as DirectoryInquiryOrderedTalent[] };

  const talentMap = new Map(
    (talentRows ?? []).map((t) => [t.id, t] as const),
  );
  const orderedTalent = talentIds
    .map((id) => talentMap.get(id))
    .filter(Boolean) as DirectoryInquiryOrderedTalent[];

  const { data: eventTypes } = await pub
    .from("taxonomy_terms")
    .select("id, name_en")
    .eq("kind", "event_type")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  const defaultEmail = user?.email ?? undefined;
  const defaultName =
    profile?.display_name ??
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    undefined;

  return {
    kind: "ready",
    inquiriesOpen: publicSettings.inquiriesOpen,
    agencyWhatsAppNumber: publicSettings.agencyWhatsAppNumber ?? undefined,
    mode: user ? "client" : "guest",
    defaultEmail,
    defaultName,
    defaultPhone: clientProfile?.phone ?? undefined,
    defaultCompany: clientProfile?.company_name ?? undefined,
    talentIds,
    orderedTalent,
    eventTypes: eventTypes ?? [],
  };
}
