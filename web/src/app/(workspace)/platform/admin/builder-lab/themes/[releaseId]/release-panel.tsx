"use client";

import { useState, useTransition } from "react";

import type { DryRunReport } from "@/lib/talent-site/theme-releases/manager/dry-run";
import { ITEM_TYPES, itemId, itemsMissingNotes, screenshotOf } from "@/lib/talent-site/theme-releases/manager/items";
import type { ReleaseChannel, ReleaseItem, ReleaseItemType, ReleaseStatus } from "@/lib/talent-site/theme-releases/types";

import {
  actionChangeChannel,
  actionRunDryRun,
  actionSaveRelease,
  actionSetPaused,
  actionSetRollout,
} from "../actions";
import { COPY, type Lang } from "../copy";
import { DryRunView } from "./dry-run-view";

interface Props {
  lang: Lang;
  release: {
    id: string;
    channel: ReleaseChannel;
    status: ReleaseStatus;
    rolloutPct: number;
    notes: { en: string; es: string };
    items: ReleaseItem[];
  };
  report: { fresh: boolean; data: DryRunReport } | null;
}

const NEXT: Record<ReleaseChannel, ReleaseChannel | null> = { draft: "demos", demos: "optin", optin: "default", default: null };

const field = "w-full rounded border border-white/20 bg-transparent px-2 py-1 text-sm text-white";
const btn =
  "rounded border border-white/30 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

export function ReleasePanel({ lang, release, report: initialReport }: Props) {
  const t = COPY[lang];
  const [items, setItems] = useState<ReleaseItem[]>(release.items);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState(release.notes);
  const [notesDirty, setNotesDirty] = useState(false);
  const [report, setReport] = useState(initialReport);
  const [channel, setChannel] = useState(release.channel);
  const [status, setStatus] = useState(release.status);
  const [pct, setPct] = useState(release.rolloutPct);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Any unsaved edit makes the report stale: saving changes the items hash.
  const hasUnsaved = dirty.size > 0 || notesDirty;
  const fresh = !!report?.fresh && !hasUnsaved;

  function edit(id: string, patch: Partial<ReleaseItem> & { screenshotUrl?: string; critical?: boolean; noteEn?: string; noteEs?: string }) {
    setItems((list) =>
      list.map((it) => {
        if (itemId(it) !== id) return it;
        const next: ReleaseItem = { ...it };
        if (patch.type) next.type = patch.type;
        if (patch.noteEn !== undefined) next.note = { ...(it.note ?? {}), en: patch.noteEn };
        if (patch.noteEs !== undefined) next.note = { ...(next.note ?? it.note ?? {}), es: patch.noteEs };
        if (patch.screenshotUrl !== undefined) next.detail = { ...(it.detail ?? {}), screenshotUrl: patch.screenshotUrl };
        if (patch.critical !== undefined) {
          if (patch.critical && next.type !== "critical") {
            next.detail = { ...(next.detail ?? {}), wasType: next.type };
            next.type = "critical";
          } else if (!patch.critical && next.type === "critical") {
            const was = (next.detail?.wasType as ReleaseItemType | undefined) ?? "layout";
            next.type = was;
          }
        }
        return next;
      }),
    );
    setDirty((d) => new Set(d).add(id));
  }

  function run<T>(job: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: (d: T) => string | null) {
    setMsg(null);
    start(async () => {
      const res = await job();
      setMsg(res.ok ? done(res.data) : res.error);
    });
  }

  function save() {
    run(
      () =>
        actionSaveRelease(release.id, {
          itemEdits: items
            .filter((it) => dirty.has(itemId(it)))
            .map((it) => ({
              id: itemId(it),
              type: it.type,
              noteEn: it.note?.en ?? "",
              noteEs: it.note?.es ?? "",
              screenshotUrl: screenshotOf(it) ?? "",
            })),
          notesEn: notes.en,
          notesEs: notes.es,
        }),
      () => {
        setDirty(new Set());
        setNotesDirty(false);
        setReport((r) => (r ? { ...r, fresh: false } : r));
        return t.saved;
      },
    );
  }

  function go(target: ReleaseChannel, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    run(
      () => actionChangeChannel(release.id, target),
      (d) => {
        setChannel(d.channel);
        setStatus(d.channel === "optin" || d.channel === "default" ? "published" : "draft");
        const warn = d.warnings.length > 0 ? ` ${t.cacheWarn}: ${d.warnings.join(" | ")}` : "";
        return `${t.done} ${d.demosApplied} ${t.demosDone}, ${d.updates} ${t.noticesDone}, ${d.bells} ${t.bellsDone}.${warn}`;
      },
    );
  }

  const next = NEXT[channel];
  const missing = itemsMissingNotes(items);
  const canMove = (target: ReleaseChannel) => !pending && fresh && next === target && status !== "archived" && status !== "paused";

  return (
    <div className="grid gap-8">
      {msg ? (
        <p role="status" className="rounded border border-white/20 bg-white/10 px-3 py-2 text-sm">
          {msg}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-lg font-medium">{t.notesTitle}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs text-white/60">
            {t.notesEn}
            <textarea className={field} rows={3} value={notes.en} onChange={(e) => { setNotes({ ...notes, en: e.target.value }); setNotesDirty(true); }} />
          </label>
          <label className="grid gap-1 text-xs text-white/60">
            {t.notesEs}
            <textarea className={field} rows={3} value={notes.es} onChange={(e) => { setNotes({ ...notes, es: e.target.value }); setNotesDirty(true); }} />
          </label>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">{t.itemsTitle}</h2>
        <p className="mb-2 text-sm text-white/60">{t.itemsLead}</p>
        {items.length === 0 ? <p className="text-sm text-white/50">{t.noItems}</p> : null}
        {missing > 0 ? (
          <p className="mb-2 text-xs text-white/60">
            {missing} {t.missingNotes}
          </p>
        ) : null}
        <ul className="grid gap-3">
          {items.map((it) => {
            const id = itemId(it);
            return (
              <li key={id} className="rounded border border-white/10 bg-white/5 p-3" data-item={id}>
                <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
                  <code className="text-xs text-white/70">{it.key}</code>
                  <label className="flex items-center gap-1 text-xs text-white/60">
                    {t.type}
                    <select className="rounded border border-white/20 bg-transparent px-1 py-0.5 text-sm text-white" value={it.type} onChange={(e) => edit(id, { type: e.target.value as ReleaseItemType })}>
                      {ITEM_TYPES.map((ty) => (
                        <option key={ty} value={ty} className="text-black">
                          {t.typeNames[ty]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-xs text-white/70">
                    <input type="checkbox" checked={it.type === "critical"} onChange={(e) => edit(id, { critical: e.target.checked })} />
                    {t.critical}
                  </label>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="grid gap-1 text-xs text-white/60">
                    {t.noteEn}
                    <input className={field} value={it.note?.en ?? ""} onChange={(e) => edit(id, { noteEn: e.target.value })} />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60">
                    {t.noteEs}
                    <input className={field} value={it.note?.es ?? ""} onChange={(e) => edit(id, { noteEs: e.target.value })} />
                  </label>
                  <label className="grid gap-1 text-xs text-white/60 md:col-span-2">
                    {t.screenshot}
                    <input className={field} value={screenshotOf(it) ?? ""} onChange={(e) => edit(id, { screenshotUrl: e.target.value })} />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3">
          <button type="button" className={btn} disabled={pending || !hasUnsaved} onClick={save}>
            {t.save}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">{t.dryTitle}</h2>
        <p className="mb-2 text-sm text-white/60">{t.dryLead}</p>
        <button
          type="button"
          className={btn}
          disabled={pending || hasUnsaved}
          onClick={() =>
            run(
              () => actionRunDryRun(release.id),
              (d) => {
                setReport({ fresh: true, data: d });
                return t.done;
              },
            )
          }
        >
          {pending ? t.running : t.dryRun}
        </button>
        <div className="mt-3">
          {report ? <DryRunView report={report.data} lang={lang} stale={!fresh} /> : <p className="text-sm text-white/50">{t.dryNone}</p>}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">{t.channelsTitle}</h2>
        <p className="mb-2 text-sm text-white/60">{t.channelsLead}</p>
        <p className="mb-3 text-sm">
          <span className="rounded bg-white/10 px-2 py-0.5">{t.channel[channel]}</span>{" "}
          <span className="text-white/50">{t.status[status]}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={!canMove("demos")} onClick={() => go("demos", t.confirmDemos)}>
            {t.toDemos}
          </button>
          <button type="button" className={btn} disabled={!canMove("optin")} onClick={() => go("optin", t.confirmOptin)}>
            {t.toOptin}
          </button>
          <button type="button" className={btn} disabled={!canMove("default")} onClick={() => go("default", t.confirmDefault)}>
            {t.toDefault}
          </button>
          <button
            type="button"
            className={btn}
            disabled={pending || status === "archived"}
            onClick={() =>
              run(
                () => actionSetPaused(release.id, status !== "paused"),
                () => {
                  setStatus(status === "paused" ? (channel === "optin" || channel === "default" ? "published" : "draft") : "paused");
                  return t.done;
                },
              )
            }
          >
            {status === "paused" ? t.resume : t.pause}
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium">{t.rolloutTitle}</h2>
        <p className="mb-2 text-sm text-white/60">{t.rolloutLead}</p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label={t.rolloutTitle} />
          <span className="w-12 text-sm">{pct}%</span>
          <button
            type="button"
            className={btn}
            disabled={pending || status === "archived"}
            onClick={() =>
              run(
                () => actionSetRollout(release.id, pct),
                (d) => `${t.done} ${d.updates} ${t.noticesDone}, ${d.bells} ${t.bellsDone}.`,
              )
            }
          >
            {t.rolloutSet}
          </button>
        </div>
      </section>
    </div>
  );
}
