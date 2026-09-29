import "server-only";

/**
 * talent_faq_items reads / writes for the talent's own FAQ editor (PR 7).
 * Owner writes go through the service role (the table has no owner write
 * policy); every query is scoped to the caller's own talent_profile_id, which
 * the action resolves from the session. The `*_i18n` columns are optional
 * until migration 20261231299520 is everywhere: missing-column errors retry
 * without them.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { isPostgrestMissingColumnError, logServerError } from "@/lib/server/safe-error";
import { faqRowToItem, planFaqSave, type FaqEditorItem, type FaqRowWrite } from "./faq-editor-model";

type Row = {
  id: string;
  question: string | null;
  answer: string | null;
  question_i18n?: unknown;
  answer_i18n?: unknown;
};

export async function readOwnFaqItems(
  talentProfileId: string,
  primary: string,
): Promise<FaqEditorItem[] | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const base = "id, question, answer, sort_order";
  let res = await admin
    .from("talent_faq_items")
    .select(`${base}, question_i18n, answer_i18n`)
    .eq("talent_profile_id", talentProfileId)
    .order("sort_order", { ascending: true })
    .returns<Row[]>();
  if (res.error && isPostgrestMissingColumnError(res.error)) {
    res = await admin
      .from("talent_faq_items")
      .select(base)
      .eq("talent_profile_id", talentProfileId)
      .order("sort_order", { ascending: true })
      .returns<Row[]>();
  }
  if (res.error) {
    logServerError("faq-editor.read", res.error);
    return null;
  }
  return (res.data ?? []).map((r) => faqRowToItem(r, primary));
}

function stripI18n(row: FaqRowWrite): Omit<FaqRowWrite, "question_i18n" | "answer_i18n"> {
  return { question: row.question, answer: row.answer, sort_order: row.sort_order };
}

export async function writeOwnFaqItems(
  talentProfileId: string,
  items: readonly FaqEditorItem[],
  primary: string,
): Promise<boolean> {
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data: current, error: readErr } = await admin
    .from("talent_faq_items")
    .select("id")
    .eq("talent_profile_id", talentProfileId)
    .returns<{ id: string }[]>();
  if (readErr) {
    logServerError("faq-editor.ids", readErr);
    return false;
  }
  const plan = planFaqSave((current ?? []).map((r) => r.id), items, primary);
  const now = new Date().toISOString();
  let withI18n = true;

  for (const u of plan.updates) {
    const { id, ...row } = u;
    const payload = withI18n ? row : stripI18n(row);
    let { error } = await admin
      .from("talent_faq_items")
      .update({ ...payload, updated_at: now })
      .eq("id", id)
      .eq("talent_profile_id", talentProfileId);
    if (error && withI18n && isPostgrestMissingColumnError(error)) {
      withI18n = false;
      ({ error } = await admin
        .from("talent_faq_items")
        .update({ ...stripI18n(row), updated_at: now })
        .eq("id", id)
        .eq("talent_profile_id", talentProfileId));
    }
    if (error) {
      logServerError("faq-editor.update", error);
      return false;
    }
  }
  if (plan.inserts.length > 0) {
    const rows = plan.inserts.map((r) => ({
      ...(withI18n ? r : stripI18n(r)),
      talent_profile_id: talentProfileId,
      status: "published",
    }));
    let { error } = await admin.from("talent_faq_items").insert(rows);
    if (error && withI18n && isPostgrestMissingColumnError(error)) {
      ({ error } = await admin
        .from("talent_faq_items")
        .insert(rows.map(({ question_i18n: _q, answer_i18n: _a, ...rest }) => rest)));
    }
    if (error) {
      logServerError("faq-editor.insert", error);
      return false;
    }
  }
  if (plan.deletes.length > 0) {
    const { error } = await admin
      .from("talent_faq_items")
      .delete()
      .in("id", plan.deletes)
      .eq("talent_profile_id", talentProfileId);
    if (error) {
      logServerError("faq-editor.delete", error);
      return false;
    }
  }
  return true;
}
