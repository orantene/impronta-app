"use client";

import { useEffect, useState, useTransition } from "react";

import type { DemoRebuildResult, DemoRebuildRow } from "@/lib/talent-site/demos/types";

import { ConfirmDialog } from "./[releaseId]/confirm-dialog";
import { actionRebuildDemos, actionRestoreDemoRun } from "./demo-rebuild-actions";
import { DEMO_REBUILD_COPY } from "./demo-rebuild-copy";
import type { Lang } from "./copy";

/** Give up waiting on a dry run after this long and offer a retry. */
export const PREVIEW_TIMEOUT_MS = 30_000;

/** Resolves with the action result, or a timeout error (the server work is not cancelled). */
export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const t = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

const btn =
  "rounded border border-white/30 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";

function chipClass(status: DemoRebuildRow["status"]): string {
  if (status === "failed" || status === "refused") return "bg-white/10 text-red-300";
  if (status === "wrote") return "bg-white/20 text-white";
  return "bg-white/10 text-white/70";
}

/** Preview, confirm and run the demo rebuild for ONE design. */
export function DemoRebuildPanel({ design, lang }: { design: string; lang: Lang }) {
  const t = DEMO_REBUILD_COPY[lang];
  const [preview, setPreview] = useState<DemoRebuildResult | null>(null);
  const [result, setResult] = useState<DemoRebuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<Set<string>>(new Set());
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();
  const [elapsed, setElapsed] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const checking = pending && !result && !confirmOpen && restoringId === null;

  useEffect(() => {
    if (!checking) {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [checking]);

  const toWrite = preview ? preview.rows.filter((r) => r.status === "would_write").length : 0;

  function runPreview() {
    setError(null);
    setTimedOut(false);
    setResult(null);
    start(async () => {
      const res = await withTimeout(actionRebuildDemos(design, true), PREVIEW_TIMEOUT_MS, null);
      if (res === null) {
        setTimedOut(true);
        setError(t.timeout);
      } else if (res.ok) setPreview(res.data);
      else setError(res.error || t.genericError);
    });
  }

  function runRebuild() {
    setConfirmOpen(false);
    setError(null);
    start(async () => {
      const res = await actionRebuildDemos(design, false);
      if (res.ok) {
        setResult(res.data);
        setPreview(null);
        setRestored(new Set());
      } else setError(res.error || t.genericError);
    });
  }

  function restore(runId: string) {
    setError(null);
    setRestoringId(runId);
    start(async () => {
      const res = await actionRestoreDemoRun(runId);
      setRestoringId(null);
      if (res.ok) setRestored((s) => new Set(s).add(runId));
      else setError(res.error || t.genericError);
    });
  }

  const rows = result?.rows ?? preview?.rows ?? null;

  return (
    <div className="mt-4 border-t border-white/10 pt-4" data-demo-rebuild={design}>
      <ConfirmDialog
        open={confirmOpen}
        message={t.confirm(toWrite, design)}
        confirmLabel={t.confirmYes}
        cancelLabel={t.confirmCancel}
        onConfirm={runRebuild}
        onCancel={() => setConfirmOpen(false)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40">{t.title}</p>
          <p className="mt-1 max-w-2xl text-sm text-white/60">{t.lead}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={pending} onClick={runPreview}>
            {checking ? t.previewing : t.preview}
          </button>
          {preview && toWrite > 0 ? (
            <button type="button" className={`${btn} bg-white/15 font-medium`} disabled={pending} onClick={() => setConfirmOpen(true)}>
              {t.rebuild(toWrite)}
            </button>
          ) : null}
        </div>
      </div>

      {checking && elapsed >= 2 ? (
        <p role="status" className="mt-3 text-sm text-white/60" data-rebuild-elapsed>
          {t.elapsed(elapsed)}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}{" "}
          {timedOut ? (
            <button type="button" className="underline" onClick={runPreview} data-rebuild-retry>
              {t.retry}
            </button>
          ) : null}
        </p>
      ) : null}

      {preview && preview.rows.length === 0 ? <p className="mt-3 text-sm text-white/60">{t.noDemos}</p> : null}
      {preview && preview.rows.length > 0 && toWrite === 0 ? <p className="mt-3 text-sm text-white/60">{t.nothingToDo}</p> : null}

      {rows && rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <p className="mb-1 text-xs uppercase tracking-wider text-white/40">{result ? t.resultTitle : t.previewTitle}</p>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                <th className="py-1 pr-3 font-normal">{t.colDemo}</th>
                <th className="py-1 pr-3 font-normal">{t.colVersion}</th>
                <th className="py-1 pr-3 font-normal">{t.colStatus}</th>
                <th className="py-1 pr-3 font-normal">{t.colChanged}</th>
                <th className="py-1 font-normal" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.profileCode} className="border-t border-white/5 align-top">
                  <td className="py-1.5 pr-3">{r.profileCode}</td>
                  <td className="py-1.5 pr-3">{r.version === null ? "-" : `v${r.version}`}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${chipClass(r.status)}`}>{t.status[r.status]}</span>
                    {r.error ? <p className="mt-1 text-xs text-red-300">{r.error}</p> : null}
                  </td>
                  <td className="py-1.5 pr-3 text-white/70">
                    {r.changed.length ? r.changed.map((s) => t.steps[s]).join(", ") : t.none}
                  </td>
                  <td className="py-1.5 text-right">
                    {r.status === "wrote" && r.runId ? (
                      restored.has(r.runId) ? (
                        <span className="text-xs text-white/60">{t.restored}</span>
                      ) : (
                        <button type="button" className={btn} disabled={pending} onClick={() => restore(r.runId as string)}>
                          {restoringId === r.runId ? t.restoring : t.restore}
                        </button>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
