"use client";

/**
 * TalentFaqEditor: the talent's own questions and answers (PR 7). Until now FAQ
 * rows only arrived through the Maison import; this is the minimal editor:
 * add, remove, reorder, one `LocaleField` per question and answer, one Save.
 * Rows feed the site's FAQ section (`bindSource: "talent_faq_items"`).
 */
import { useEffect, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { LocaleField } from "@/components/admin/shell/internal/primitives/locale-field";
import { useBeforeUnloadGuard } from "@/components/locale-field/use-before-unload-guard";
import { useTalentFieldLocales } from "@/components/locale-field/use-talent-field-locales";
import { loadMyFaqItems, saveMyFaqItems } from "@/lib/talent/faq-editor-actions";
import { MAX_FAQ_ANSWER, MAX_FAQ_ITEMS, MAX_FAQ_QUESTION, type FaqEditorItem } from "@/lib/talent/faq-editor-model";

type Draft = FaqEditorItem & { key: string };

const BTN =
  "inline-flex h-[30px] cursor-pointer items-center rounded-[8px] border border-admin-border px-2.5 font-admin-body text-[12px] font-semibold text-admin-ink disabled:cursor-not-allowed disabled:opacity-50";

let keySeq = 0;
const withKey = (item: FaqEditorItem): Draft => ({ ...item, key: item.id ?? `new-${(keySeq += 1)}` });

export function TalentFaqEditor() {
  const copy = useDashboardText();
  const store = useTalentFieldLocales();
  const [primary, setPrimary] = useState<string | null>(null);
  const [rows, setRows] = useState<Draft[]>([]);
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "saved" | "error">("loading");
  const [baseline, setBaseline] = useState("[]");

  useEffect(() => {
    let live = true;
    void loadMyFaqItems().then((res) => {
      if (!live) return;
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setPrimary(res.primary);
      const drafts = res.items.map(withKey);
      setBaseline(JSON.stringify(res.items));
      setRows(drafts);
      setStatus("idle");
    });
    return () => {
      live = false;
    };
  }, []);

  const plain = (list: Draft[]) => list.map(({ key: _key, ...item }) => item);
  const dirty = status !== "loading" && JSON.stringify(plain(rows)) !== baseline;
  useBeforeUnloadGuard(dirty);

  if (primary === null) {
    return status === "error" ? (
      <p className="font-admin-body text-[12.5px] text-admin-critical">{copy.t("Couldn't save. Try again.")}</p>
    ) : null;
  }
  const locales = store.localesFor(primary);

  const update = (i: number, part: "question" | "answer", locale: string, value: string) =>
    setRows((list) => list.map((r, j) => (j === i ? { ...r, [part]: { ...r[part], [locale]: value } } : r)));
  const move = (i: number, by: -1 | 1) =>
    setRows((list) => {
      const j = i + by;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      const [row] = next.splice(i, 1);
      if (row) next.splice(j, 0, row);
      return next;
    });

  const save = async () => {
    setStatus("saving");
    const items = plain(rows);
    const res = await saveMyFaqItems(items);
    if (!res.ok) {
      setStatus("error");
      return;
    }
    const fresh = await loadMyFaqItems();
    if (fresh.ok) {
      setBaseline(JSON.stringify(fresh.items));
      setRows(fresh.items.map(withKey));
    }
    setStatus("saved");
  };

  return (
    <section className="mt-8 rounded-[14px] border border-admin-border-soft bg-admin-card p-4 font-admin-body">
      <h2 className="text-[15px] font-semibold text-admin-ink">{copy.t("Questions and answers")}</h2>
      <p className="mt-0.5 text-[12.5px] text-admin-ink-muted">
        {copy.t("Answer the questions clients ask before they book.")}
      </p>
      <ol className="mt-3 flex flex-col gap-3">
        {rows.length === 0 ? (
          <li className="text-[12.5px] text-admin-ink-dim">{copy.t("No questions yet.")}</li>
        ) : null}
        {rows.map((row, i) => (
          <li key={row.key} className="flex flex-col gap-2 rounded-[10px] border border-admin-border-soft p-3">
            <LocaleField
              label={`${copy.t("Question")} ${i + 1}`}
              value={row.question}
              locales={locales}
              primary={primary}
              ai={{ field: "faq_question" }}
              maxLength={MAX_FAQ_QUESTION}
              onChange={(l, v) => update(i, "question", l, v)}
            />
            <LocaleField
              label={copy.t("Answer")}
              value={row.answer}
              locales={locales}
              primary={primary}
              ai={{ field: "faq_answer" }}
              multiline
              rows={3}
              maxLength={MAX_FAQ_ANSWER}
              onChange={(l, v) => update(i, "answer", l, v)}
            />
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={BTN} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑ {copy.t("Move up")}
              </button>
              <button type="button" className={BTN} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                ↓ {copy.t("Move down")}
              </button>
              <button
                type="button"
                className={BTN}
                onClick={() => setRows((list) => list.filter((_, j) => j !== i))}
              >
                {copy.t("Remove question")}
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={BTN}
          disabled={rows.length >= MAX_FAQ_ITEMS}
          onClick={() => setRows((list) => [...list, withKey({ id: null, question: {}, answer: {} })])}
        >
          + {copy.t("Add a question")}
        </button>
        <button
          type="button"
          className="inline-flex h-[30px] cursor-pointer items-center rounded-[8px] border border-emerald-900 bg-emerald-900 px-3 font-admin-body text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!dirty || status === "saving"}
          onClick={() => void save()}
        >
          {copy.t("Save")}
        </button>
        <span className="text-[12px] text-admin-ink-muted" aria-live="polite">
          {status === "saved" && !dirty
            ? copy.t("Saved")
            : status === "error"
              ? copy.t("Couldn't save. Try again.")
              : dirty
                ? copy.t("You have unsaved changes.")
                : ""}
        </span>
      </div>
    </section>
  );
}
