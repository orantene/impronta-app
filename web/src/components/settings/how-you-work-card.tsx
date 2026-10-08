"use client";

/**
 * TUL-86 · 1E: Settings card "How you work". Shows the derived current choice
 * and the moves available from it, each behind a confirm sheet (ES/EN). Shared
 * by talent settings and workspace admin settings.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import type { HowYouWorkMove } from "@/lib/onboarding/how-you-work";
import {
  loadHowYouWork,
  runHowYouWorkMoveAction,
  type HowYouWorkView,
} from "@/lib/server-actions/how-you-work";
import { alsoTakeBookingsAction } from "@/lib/server-actions/also-take-bookings";

import { HYW_CURRENT, HYW_DESC, HYW_MOVES, HYW_TITLE, HYW_UI } from "./how-you-work-copy";

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

export function HowYouWorkCard() {
  const lang = useDashboardLocale().toLowerCase().startsWith("es") ? "es" : "en";
  const router = useRouter();
  const [view, setView] = useState<HowYouWorkView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [confirming, setConfirming] = useState<HowYouWorkMove | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const r = await loadHowYouWork();
    if (r.ok) {
      setView(r.view);
      setLoadFailed(false);
    } else setLoadFailed(true);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  function open(move: HowYouWorkMove) {
    setError(null);
    setDone(false);
    const base = view?.defaultDisplayName ? `${view.defaultDisplayName} Studio` : "";
    setName(base);
    setSlug(slugify(base));
    setConfirming(move);
  }

  function confirm() {
    if (!confirming) return;
    const move = confirming;
    setError(null);
    startTransition(async () => {
      // TUL-269: "add me as a provider" is the idempotent owner-only conversion
      // (profile + live + roster + own site); the other moves are unchanged.
      if (move === "add_provider") {
        const conv = await alsoTakeBookingsAction();
        if (!conv.ok) {
          setError(conv.completed.length > 0 ? `${conv.error} ${HYW_UI.partial[lang]}` : conv.error);
          if (conv.completed.length > 0) await refresh();
          return;
        }
        setConfirming(null);
        setDone(true);
        await refresh();
        router.refresh();
        return;
      }
      const res = await runHowYouWorkMoveAction(move, {
        workspaceName: name,
        slug,
        location: "",
        displayName: view?.defaultDisplayName ?? undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirming(null);
      setDone(true);
      await refresh();
      if (move === "open_studio" && res.slug) router.push(`/${res.slug}/admin`);
      else router.refresh();
    });
  }

  const copy = confirming ? HYW_MOVES[confirming] : null;

  return (
    <div data-testid="how-you-work-card" className="rounded-admin-lg border border-admin-border-soft bg-admin-card p-4">
      <div className="text-[13px] font-semibold text-admin-ink">{HYW_TITLE[lang]}</div>
      <div className="mt-0.5 text-[12px] text-admin-ink-muted">{HYW_DESC[lang]}</div>

      {loadFailed ? (
        <div role="alert" className="mt-3 text-[12.5px] text-admin-critical-deep">{HYW_UI.loadError[lang]}</div>
      ) : !view ? (
        <div className="mt-3 text-[12.5px] text-admin-ink-muted">{HYW_UI.working[lang]}</div>
      ) : (
        <>
          <div className="mt-3 text-[13.5px] font-medium text-admin-ink" data-testid="how-you-work-current">
            {HYW_CURRENT[view.choice][lang]}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {view.moves.map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() => open(m)}
                className="cursor-pointer rounded-full border border-admin-border bg-admin-surface px-[14px] py-[7px] text-[12.5px] font-medium text-admin-ink hover:bg-admin-surface-alt disabled:opacity-60"
              >
                {HYW_MOVES[m].label[lang]}
              </button>
            ))}
          </div>
          {done ? <div role="status" className="mt-2 text-[12px] text-admin-success-deep">{HYW_UI.done[lang]}</div> : null}
        </>
      )}

      {copy && confirming ? (
        <div role="dialog" aria-modal="true" aria-label={copy.title[lang]} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-admin-lg border border-admin-border bg-admin-card p-5">
            <div className="text-[15px] font-semibold text-admin-ink">{copy.title[lang]}</div>
            <p className="mt-1.5 text-[13px] leading-snug text-admin-ink-muted">{copy.body[lang]}</p>
            {confirming === "open_studio" ? (
              <div className="mt-3 flex flex-col gap-2">
                <label className="text-[12px] text-admin-ink-muted">
                  {HYW_UI.workspaceName[lang]}
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setSlug(slugify(e.target.value));
                    }}
                    disabled={busy}
                    className="mt-1 block w-full rounded-[8px] border border-admin-border bg-admin-surface px-[10px] py-[7px] text-[13px] text-admin-ink"
                  />
                </label>
                <label className="text-[12px] text-admin-ink-muted">
                  {HYW_UI.slug[lang]}
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    disabled={busy}
                    spellCheck={false}
                    className="mt-1 block w-full rounded-[8px] border border-admin-border bg-admin-surface px-[10px] py-[7px] text-[13px] text-admin-ink"
                  />
                </label>
              </div>
            ) : null}
            {error ? <div role="alert" className="mt-3 text-[12.5px] text-admin-critical-deep">{error}</div> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirming(null)} className="cursor-pointer rounded-full border border-admin-border bg-transparent px-[14px] py-[7px] text-[12.5px] text-admin-ink disabled:opacity-60">
                {HYW_UI.cancel[lang]}
              </button>
              <button
                type="button"
                disabled={busy || (confirming === "open_studio" && (!name.trim() || !slug))}
                onClick={confirm}
                className="cursor-pointer rounded-full border-0 bg-admin-ink px-[14px] py-[7px] text-[12.5px] font-medium text-admin-card disabled:opacity-60"
              >
                {busy ? HYW_UI.working[lang] : copy.confirm[lang]}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
