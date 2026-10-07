"use client";

/**
 * Optional extra on the policies screen: the talent's own booking rules, one
 * per line, in Spanish and English. Collapsed by default. Save stamps a new
 * immutable policy version; the page shows them after the generated text.
 */

import { useState } from "react";

import { savePolicyCustomClauses } from "@/lib/talent-policies/actions";
import {
  CUSTOM_CLAUSES_MAX_ITEMS,
  CUSTOM_CLAUSE_MAX_CHARS,
  linesFromText,
  textFromLines,
  type CustomClauses,
} from "@/lib/talent-policies/custom-clauses";

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

type Status = "idle" | "saving" | "saved" | "too_many" | "too_long" | "error";

export function PolicyCustomClausesEditor({
  talentId,
  initial,
  previewPath,
  tt,
  onSaved,
}: {
  talentId: string;
  initial: CustomClauses | null;
  previewPath: string | null;
  tt: (en: string) => string;
  onSaved: () => void;
}) {
  const [es, setEs] = useState(textFromLines(initial?.es ?? []));
  const [en, setEn] = useState(textFromLines(initial?.en ?? []));
  const [status, setStatus] = useState<Status>("idle");

  const dirty = es !== textFromLines(initial?.es ?? []) || en !== textFromLines(initial?.en ?? []);

  async function save() {
    const tooMany = linesFromText(es).length > CUSTOM_CLAUSES_MAX_ITEMS || linesFromText(en).length > CUSTOM_CLAUSES_MAX_ITEMS;
    const tooLong = [...linesFromText(es), ...linesFromText(en)].some((l) => l.length > CUSTOM_CLAUSE_MAX_CHARS);
    if (tooMany) return setStatus("too_many");
    if (tooLong) return setStatus("too_long");
    setStatus("saving");
    const res = await savePolicyCustomClauses(talentId, { es, en }).catch(() => null);
    if (!res || !res.ok) return setStatus("error");
    setStatus("saved");
    onSaved();
  }

  const area =
    "mt-1 block min-h-[120px] w-full rounded-lg border border-admin-border-soft bg-white px-3 py-2 text-[14px] leading-relaxed text-admin-ink";

  return (
    <details data-policy-custom-clauses="" className="mb-3 rounded-xl border border-admin-border-soft bg-white px-4 py-3">
      <summary className="flex min-h-[44px] cursor-pointer items-center text-[15px] font-semibold text-admin-ink">
        {tt("Your own rules (optional)")}
      </summary>
      <p className="mt-2 text-[13px] text-admin-ink-muted">
        {fill(tt("Write one rule per line. They appear after the points above, as a numbered list. Up to {n} rules, {c} characters each."), {
          n: CUSTOM_CLAUSES_MAX_ITEMS,
          c: CUSTOM_CLAUSE_MAX_CHARS,
        })}
      </p>
      <label className="mt-3 block text-[13px] font-semibold text-admin-ink">
        {tt("Spanish")}
        <textarea value={es} onChange={(e) => setEs(e.target.value)} className={area} lang="es" />
      </label>
      <label className="mt-3 block text-[13px] font-semibold text-admin-ink">
        {tt("English")}
        <textarea value={en} onChange={(e) => setEn(e.target.value)} className={area} lang="en" />
      </label>
      <p className="mt-2 text-[12.5px] text-admin-ink-muted">
        {tt("If a language is empty, your clients read the other one.")}
      </p>
      {status === "saved" ? (
        <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-900">
          {tt("Saved. Your rules are live.")}
        </p>
      ) : null}
      {status === "too_many" || status === "too_long" || status === "error" ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3.5 py-2.5 text-[13px] text-red-800">
          {status === "too_many"
            ? fill(tt("Too many rules. The most is {n} per language."), { n: CUSTOM_CLAUSES_MAX_ITEMS })
            : status === "too_long"
              ? fill(tt("One rule is too long. The most is {c} characters."), { c: CUSTOM_CLAUSE_MAX_CHARS })
              : tt("Could not save. Try again in a moment.")}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!dirty || status === "saving"}
          onClick={() => void save()}
          className="min-h-[44px] rounded-lg bg-[var(--tc-action)] px-4 text-[14px] font-semibold text-white hover:bg-[var(--tc-action-hover)] disabled:opacity-40"
        >
          {status === "saving" ? tt("Saving") : tt("Save rules")}
        </button>
        {previewPath ? (
          <a
            href={previewPath}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center text-[13.5px] font-semibold text-emerald-900 underline"
          >
            {tt("Preview your policies page")}
          </a>
        ) : null}
      </div>
    </details>
  );
}
