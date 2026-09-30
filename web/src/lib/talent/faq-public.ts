/**
 * Public read of published `talent_faq_items` for Maison FAQ bind (W16).
 *
 * With a `locale`, each question / answer is read through
 * `readI18n(question_i18n, question, locale, chain)`; without one (the
 * default) it returns the plain columns exactly as before. The i18n columns
 * are read on a graceful path until migration 20261231299520 is applied.
 */
import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { readI18n } from "@/lib/i18n/i18n-columns";
import { selectWithI18nFallback } from "@/lib/i18n/i18n-select-fallback";
import type { TalentFaqItemRow } from "@/lib/talent-site/theme-catalog/maison/faq-bind";

const BASE_COLS = "id, question, answer, sort_order";

type FaqDb = {
  id: string;
  question: string | null;
  answer: string | null;
  sort_order?: number | null;
  question_i18n?: unknown;
  answer_i18n?: unknown;
};

export async function loadPublishedFaqForProfile(
  talentProfileId: string,
  locale?: string,
  chain?: readonly string[],
): Promise<TalentFaqItemRow[]> {
  const id = talentProfileId?.trim();
  if (!id) return [];
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await selectWithI18nFallback((withI18n) =>
    admin
      .from("talent_faq_items")
      .select(withI18n ? `${BASE_COLS}, question_i18n, answer_i18n` : BASE_COLS)
      .eq("talent_profile_id", id)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
  );
  if (error) {
    logServerError("faq.loadPublished", error);
    return [];
  }
  const text = (map: unknown, plain: string | null): string =>
    locale ? readI18n(map, plain, locale, chain ?? [locale]) : String(plain ?? "");
  return ((data ?? []) as unknown as FaqDb[]).map((row) => ({
    id: String(row.id),
    question: text(row.question_i18n, row.question),
    answer: text(row.answer_i18n, row.answer),
    sort_order: Number(row.sort_order ?? 0),
  }));
}
