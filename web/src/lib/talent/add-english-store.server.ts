import "server-only";

/**
 * TUL-361: scoped reads and writes behind the "Add English" server actions.
 * Every query is keyed by the caller's own talent profile id (the action
 * resolves it from the session), exactly like photo-caption-actions.ts.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { AddEnglishDeps } from "./add-english-core";
import type { MissingEnglishOffering, MissingEnglishPhoto } from "./missing-english";

export async function loadEnglishSources(
  talentProfileId: string,
): Promise<{ offerings: MissingEnglishOffering[]; photos: MissingEnglishPhoto[] } | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const [offerings, photos] = await Promise.all([
    admin
      .from("talent_offerings")
      .select("id, title, category, title_i18n, category_i18n")
      .eq("talent_profile_id", talentProfileId)
      .neq("status", "archived")
      .limit(500)
      .returns<MissingEnglishOffering[]>(),
    admin
      .from("media_assets")
      .select("id, metadata")
      .eq("owner_talent_profile_id", talentProfileId)
      .is("deleted_at", null)
      .limit(2000)
      .returns<MissingEnglishPhoto[]>(),
  ]);
  if (offerings.error) {
    logServerError("addEnglish.offerings", offerings.error);
    return null;
  }
  if (photos.error) {
    logServerError("addEnglish.photos", photos.error);
    return null;
  }
  return { offerings: offerings.data ?? [], photos: photos.data ?? [] };
}

export function addEnglishDeps(talentProfileId: string): AddEnglishDeps | null {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const column = (kind: string) => (kind === "service_title" ? "title_i18n" : "category_i18n");
  return {
    readStored: async (kind, id) => {
      if (kind === "photo_caption") {
        const { data, error } = await admin
          .from("media_assets")
          .select("metadata")
          .eq("id", id)
          .eq("owner_talent_profile_id", talentProfileId)
          .is("deleted_at", null)
          .maybeSingle<{ metadata: unknown }>();
        if (error) logServerError("addEnglish.readPhoto", error);
        return data ? { stored: data.metadata } : null;
      }
      const col = column(kind);
      const { data, error } = await admin
        .from("talent_offerings")
        .select(col)
        .eq("id", id)
        .eq("talent_profile_id", talentProfileId)
        .maybeSingle<Record<string, unknown>>();
      if (error) logServerError("addEnglish.readOffering", error);
      return data ? { stored: data[col] } : null;
    },
    writeStored: async (kind, id, value) => {
      if (kind === "photo_caption") {
        const { data, error } = await admin
          .from("media_assets")
          .update({ metadata: value })
          .eq("id", id)
          .eq("owner_talent_profile_id", talentProfileId)
          .is("deleted_at", null)
          .select("id")
          .maybeSingle<{ id: string }>();
        if (error) logServerError("addEnglish.writePhoto", error);
        return !error && !!data;
      }
      const { data, error } = await admin
        .from("talent_offerings")
        .update({ [column(kind)]: value })
        .eq("id", id)
        .eq("talent_profile_id", talentProfileId)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error) logServerError("addEnglish.writeOffering", error);
      return !error && !!data;
    },
  };
}
