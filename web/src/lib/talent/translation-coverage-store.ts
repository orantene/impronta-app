import "server-only";

/**
 * Reads every translatable field of one talent for the coverage line (PR 7):
 * offering names / descriptions, option and extra labels, FAQ questions /
 * answers, page titles / SEO pairs, and the bio. Service role, scoped to the
 * caller's own talent_profile_id (resolved by the action). A read error drops
 * that source (logged) rather than failing the whole count.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { CoverageField } from "./translation-coverage";

type AnyRow = Record<string, unknown>;

export async function loadCoverageFields(talentProfileId: string): Promise<CoverageField[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const out: CoverageField[] = [];
  const push = (rows: AnyRow[] | null, pairs: Array<[string, string]>) => {
    for (const r of rows ?? []) for (const [plain, map] of pairs) out.push({ plain: r[plain] as string | null, map: r[map] });
  };

  const [offerings, faq, pages, profile] = await Promise.all([
    admin
      .from("talent_offerings")
      .select("id, title, title_i18n, description, description_i18n")
      .eq("talent_profile_id", talentProfileId)
      .neq("status", "archived")
      .returns<AnyRow[]>(),
    admin
      .from("talent_faq_items")
      .select("question, question_i18n, answer, answer_i18n")
      .eq("talent_profile_id", talentProfileId)
      .returns<AnyRow[]>(),
    admin
      .from("talent_pages")
      .select("title, title_i18n, meta_title, meta_title_i18n, meta_description, meta_description_i18n")
      .eq("talent_profile_id", talentProfileId)
      .returns<AnyRow[]>(),
    admin.from("talent_profiles").select("bio_i18n").eq("id", talentProfileId).maybeSingle<AnyRow>(),
  ]);

  if (offerings.error) logServerError("coverage.offerings", offerings.error);
  else push(offerings.data, [["title", "title_i18n"], ["description", "description_i18n"]]);
  if (faq.error) logServerError("coverage.faq", faq.error);
  else push(faq.data, [["question", "question_i18n"], ["answer", "answer_i18n"]]);
  if (pages.error) logServerError("coverage.pages", pages.error);
  else
    push(pages.data, [
      ["title", "title_i18n"],
      ["meta_title", "meta_title_i18n"],
      ["meta_description", "meta_description_i18n"],
    ]);
  if (profile.error) logServerError("coverage.bio", profile.error);
  else if (profile.data) out.push({ plain: null, map: profile.data.bio_i18n });

  const ids = (offerings.error ? [] : (offerings.data ?? [])).map((r) => String(r.id));
  if (ids.length > 0) {
    const [variants, addons] = await Promise.all([
      admin.from("talent_offering_variants").select("label, label_i18n").in("offering_id", ids).returns<AnyRow[]>(),
      admin.from("talent_offering_addons").select("label, label_i18n").in("offering_id", ids).returns<AnyRow[]>(),
    ]);
    if (variants.error) logServerError("coverage.variants", variants.error);
    else push(variants.data, [["label", "label_i18n"]]);
    if (addons.error) logServerError("coverage.addons", addons.error);
    else push(addons.data, [["label", "label_i18n"]]);
  }
  return out;
}
