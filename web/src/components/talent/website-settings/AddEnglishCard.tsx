"use client";

/**
 * TUL-361: "Add English". Lists every piece of the talent's own content that
 * the English site has no English for (photo captions, service names, service
 * categories). Each row can ask the existing AI translate engine for ONE
 * suggestion; the suggestion lands in an editable box and is saved only when
 * the talent presses Save English. Nothing is written without that press, and
 * the Spanish text is never touched.
 */
import { useEffect, useState } from "react";

import {
  acceptEnglishAction,
  loadMissingEnglishAction,
  suggestEnglishAction,
} from "@/lib/talent/add-english-actions";
import type { MissingEnglishField, MissingEnglishKind } from "@/lib/talent/missing-english";
import { SettingsCard } from "./primitives";

type T = (s: string) => string;

function kindLabel(t: T, kind: MissingEnglishKind): string {
  if (kind === "photo_caption") return t("Photo caption");
  if (kind === "service_title") return t("Service name");
  if (kind === "service_category") return t("Service category");
  return t("Ticker word");
}

const rowKey = (f: MissingEnglishField) => `${f.kind}:${f.id}:${f.path}`;

function errorCopy(t: T, code: string): string {
  if (code === "no_key" || code === "disabled") return t("AI translation is not available on this plan.");
  if (code === "quota" || code === "rate_limit") return t("AI limit reached. Try later or write it yourself.");
  if (code === "read_only") return t("You are viewing as someone else. Changes are turned off.");
  if (code === "already_has_english") return t("This already has English.");
  return t("Translation failed. Try again.");
}

function Row({ t, field, onDone }: { t: T; field: MissingEnglishField; onDone: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggest = async () => {
    setBusy(true);
    setError(null);
    const res = await suggestEnglishAction({ kind: field.kind, id: field.id, path: field.path });
    setBusy(false);
    if (res.ok) setDraft(res.text);
    else setError(errorCopy(t, res.code));
  };

  const save = async () => {
    if (!draft?.trim()) return;
    setBusy(true);
    setError(null);
    const res = await acceptEnglishAction({ kind: field.kind, id: field.id, text: draft });
    setBusy(false);
    if (res.ok) onDone();
    else setError(errorCopy(t, res.code));
  };

  return (
    <li className="border-t border-admin-border-soft py-3 first:border-t-0">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-admin-ink-dim">{kindLabel(t, field.kind)}</p>
      <p className="mt-0.5 text-[14px] text-admin-ink">{field.source}</p>
      {draft === null ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void suggest()}
          className="mt-2 min-h-[44px] rounded-lg border border-admin-border-soft px-3 text-[13.5px] font-semibold text-admin-ink disabled:opacity-50"
        >
          {busy ? t("Working...") : t("Suggest English")}
        </button>
      ) : (
        <div className="mt-2 grid gap-2">
          <label className="grid gap-1">
            <span className="text-[12.5px] text-admin-ink-muted">{t("English (review before saving)")}</span>
            <textarea
              value={draft}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-lg border border-admin-border-soft px-3 py-2 text-[14px] text-admin-ink"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => void save()}
              className="min-h-[44px] rounded-lg bg-admin-ink px-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
            >
              {t("Save English")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDraft(null)}
              className="min-h-[44px] rounded-lg px-3 text-[13.5px] text-admin-ink-muted"
            >
              {t("Discard")}
            </button>
          </div>
        </div>
      )}
      {error ? <p className="mt-1 text-[12.5px] text-amber-900">{error}</p> : null}
    </li>
  );
}

export function AddEnglishCard({ t }: { t: T }) {
  const [fields, setFields] = useState<MissingEnglishField[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void loadMissingEnglishAction().then((res) => {
      if (live && res.ok) setFields(res.fields);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!fields || fields.length === 0) return null;
  const cue = t("{n} fields have no English yet").replace("{n}", String(fields.length));

  return (
    <SettingsCard title={t("Add English")}>
      <p className="mb-2 text-[12.5px] text-admin-ink-muted">
        {cue}. {t("Ask for a suggestion, edit it, then save. Your own text is never changed.")}
      </p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="min-h-[44px] rounded-lg border border-admin-border-soft px-3 text-[13.5px] font-semibold text-admin-ink"
      >
        {open ? t("Hide list") : t("Review fields")}
      </button>
      {open ? (
        <ul className="mt-2">
          {fields.map((f) => (
            <Row
              key={rowKey(f)}
              t={t}
              field={f}
              onDone={() => setFields((cur) => (cur ? cur.filter((x) => rowKey(x) !== rowKey(f)) : cur))}
            />
          ))}
        </ul>
      ) : null}
    </SettingsCard>
  );
}
