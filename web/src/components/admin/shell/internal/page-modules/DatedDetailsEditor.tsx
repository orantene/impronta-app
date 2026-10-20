"use client";

/**
 * DatedDetailsEditor — the info fields and the private-on-request switch for an
 * item sold as dated places (TUL-1344 slice 5). Mounted by the item editor;
 * prices and dates live elsewhere.
 */

import { useEffect, useState } from "react";

import {
  DATED_DETAIL_FIELDS,
  DATED_DETAIL_LOCALES,
  datedFieldLabel,
  type DatedDetailLocale,
  type DatedDetails,
} from "@/lib/offerings/dated-details";
import { loadDatedDetailsAction, saveDatedDetailsAction } from "@/lib/server-actions/dated-details";
import { datedDetailsEditorCopy } from "./dated-details-editor-copy";

const FIELD = "w-full rounded-[9px] border border-admin-border bg-admin-card px-[12px] py-[8px] font-admin-body text-admin-13 text-admin-ink";

export function DatedDetailsEditor({ offeringId, locale }: { offeringId: string; locale: string }) {
  const c = datedDetailsEditorCopy(locale);
  const [lang, setLang] = useState<DatedDetailLocale>(locale.toLowerCase().startsWith("es") ? "es" : "en");
  const [details, setDetails] = useState<DatedDetails>({});
  const [priv, setPriv] = useState(false);
  const [status, setStatus] = useState<"idle" | "busy" | "saved" | "failed">("idle");

  useEffect(() => {
    let live = true;
    void loadDatedDetailsAction({ offeringId }).then((res) => {
      if (!live || !res.ok) return;
      setDetails(res.details);
      setPriv(res.privateOnRequest);
    });
    return () => {
      live = false;
    };
  }, [offeringId]);

  const set = (field: string, value: string) =>
    setDetails((d) => ({ ...d, [lang]: { ...(d[lang] ?? {}), [field]: value } }));

  const save = async () => {
    setStatus("busy");
    try {
      const res = await saveDatedDetailsAction({ offeringId, details, privateOnRequest: priv });
      setStatus(res.ok ? "saved" : "failed");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <section className="flex flex-col gap-[12px]" data-testid="dated-details-editor" aria-label={c.title}>
      <div>
        <div className="font-admin-body text-[12px] font-semibold text-admin-ink">{c.title}</div>
        <div className="font-admin-body text-[11.5px] text-admin-ink-dim">{c.hint}</div>
      </div>
      <div role="group" aria-label={c.language} className="flex gap-[6px]">
        {DATED_DETAIL_LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={lang === l}
            className={`h-[28px] cursor-pointer rounded-[7px] px-[10px] font-admin-body text-[12px] font-semibold ${lang === l ? "bg-admin-brand text-white" : "bg-admin-surface-alt text-admin-ink-muted"}`}
            onClick={() => setLang(l)}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      {DATED_DETAIL_FIELDS.map((f) => (
        <label key={f.id} className="flex flex-col gap-[4px]">
          <span className="font-admin-body text-[12px] font-semibold text-admin-ink">{datedFieldLabel(f.id, locale)}</span>
          {f.id === "minAge" ? (
            <input
              inputMode="numeric"
              className={FIELD}
              value={details[lang]?.[f.id] ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              data-testid={`dated-detail-${f.id}`}
            />
          ) : (
            <textarea
              rows={f.id === "program" ? 4 : 2}
              maxLength={2000}
              className={FIELD}
              value={details[lang]?.[f.id] ?? ""}
              onChange={(e) => set(f.id, e.target.value)}
              data-testid={`dated-detail-${f.id}`}
            />
          )}
        </label>
      ))}
      <label className="flex items-start gap-[8px]">
        <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} data-testid="dated-private-switch" />
        <span>
          <span className="font-admin-body text-[12px] font-semibold text-admin-ink">{c.privateOnRequest}</span>
          <span className="block font-admin-body text-[11.5px] text-admin-ink-dim">{c.privateHint}</span>
        </span>
      </label>
      <div className="flex items-center gap-[10px]">
        <button
          type="button"
          disabled={status === "busy"}
          className="inline-flex h-[34px] cursor-pointer items-center rounded-[9px] border border-admin-border bg-admin-card px-[14px] font-admin-body text-admin-13 font-semibold text-admin-ink disabled:opacity-50"
          onClick={() => void save()}
          data-testid="dated-details-save"
        >
          {c.save}
        </button>
        {status === "saved" ? <span className="font-admin-body text-admin-13 text-admin-ink-muted">{c.saved}</span> : null}
        {status === "failed" ? <span className="font-admin-body text-admin-13 text-admin-ink-muted" role="alert">{c.failed}</span> : null}
      </div>
    </section>
  );
}
