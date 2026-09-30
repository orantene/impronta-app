/**
 * FAQ editor save planner (PR 7). Pure.
 *
 * The talent edits an ordered list of question / answer rows, each a per-locale
 * map. Saving diffs that list against the stored rows by id (NOT replace-all,
 * so imported rows keep their `import_batch_id` and undo-import still works):
 * kept ids update, new rows insert (published), missing ids delete. Array order
 * is `sort_order`. Plain `question` / `answer` hold the primary language; a row
 * without a primary question is dropped.
 */
import { i18nPair, toI18nMap } from "@/lib/i18n/i18n-columns";

export const MAX_FAQ_ITEMS = 40;
export const MAX_FAQ_QUESTION = 200;
export const MAX_FAQ_ANSWER = 1200;

export type FaqEditorItem = {
  id: string | null;
  question: Record<string, string>;
  answer: Record<string, string>;
};

export type FaqRowWrite = {
  question: string;
  answer: string;
  question_i18n: Record<string, string>;
  answer_i18n: Record<string, string>;
  sort_order: number;
};

export type FaqSavePlan = {
  updates: Array<FaqRowWrite & { id: string }>;
  inserts: FaqRowWrite[];
  deletes: string[];
};

function clip(map: Record<string, string>, max: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(toI18nMap(map))) out[k] = v.slice(0, max);
  return out;
}

export function planFaqSave(
  existingIds: readonly string[],
  items: readonly FaqEditorItem[],
  primary: string,
): FaqSavePlan {
  const known = new Set(existingIds);
  const plan: FaqSavePlan = { updates: [], inserts: [], deletes: [] };
  const kept = new Set<string>();
  let order = 0;
  for (const item of items.slice(0, MAX_FAQ_ITEMS)) {
    const q = clip(item.question, MAX_FAQ_QUESTION);
    const a = clip(item.answer, MAX_FAQ_ANSWER);
    const question = q[primary] ?? "";
    if (!question) continue;
    const answer = a[primary] ?? "";
    const row: FaqRowWrite = {
      question,
      answer,
      question_i18n: i18nPair(q, question, primary),
      answer_i18n: i18nPair(a, answer, primary),
      sort_order: order,
    };
    order += 1;
    if (item.id && known.has(item.id) && !kept.has(item.id)) {
      kept.add(item.id);
      plan.updates.push({ ...row, id: item.id });
    } else {
      plan.inserts.push(row);
    }
  }
  plan.deletes = existingIds.filter((id) => !kept.has(id));
  return plan;
}

/** Stored row → editor item (maps always carry the primary from the plain column). */
export function faqRowToItem(
  row: { id: string; question: string | null; answer: string | null; question_i18n?: unknown; answer_i18n?: unknown },
  primary: string,
): FaqEditorItem {
  return {
    id: row.id,
    question: i18nPair(row.question_i18n, row.question ?? "", primary),
    answer: i18nPair(row.answer_i18n, row.answer ?? "", primary),
  };
}
