"use client";

/**
 * RunsEventsCard — the ONLY UI that writes `agencies.runs_events`.
 *
 * Sibling of `WorkspaceTypeCard` in shape, file placement and gating (owner
 * only; the server gate in `setRunsEvents` is the real one). Two differences,
 * both deliberate:
 *
 *   - It LOADS its value with `getRunsEvents()` on mount instead of reading
 *     shell state. Putting `runsEvents` into the shell's state init is the
 *     Dashboards Director's file (`state/context.tsx`), and a settings card
 *     that fetches its own value through the same guard it writes with is
 *     the `DefaultCurrencySettingsRow` pattern already on this group.
 *   - No confirmation step. Switching off hides a link; nothing is cancelled,
 *     unpublished or deleted, and the copy says so. A confirm panel here would
 *     imply a consequence that does not exist.
 *
 * Explicit load/save state — no silent waits.
 */

import { useEffect, useState, useTransition } from "react";

import { useT } from "@/i18n/use-t";
import { getRunsEvents, setRunsEvents } from "@/lib/server-actions/runs-events";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";

const K = "dashboard.adminWorkspace.runsEvents";

export function RunsEventsCard({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [busy, startTransition] = useTransition();

  // `null` = not loaded yet or unreadable; never rendered as "off".
  const [current, setCurrent] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRunsEvents().then((res) => {
      if (cancelled) return;
      if (res.ok) setCurrent(res.runs_events);
      else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function onPick(target: boolean) {
    if (!canEdit || busy || current === null || target === current) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setRunsEvents({ runs_events: target });
      if (res.ok) {
        setCurrent(res.runs_events);
        setSaved(true);
        // The rail reads the layout payload; the action revalidated it.
        queueRouterRefresh();
        return;
      }
      setError(res.error);
    });
  }

  const options: ReadonlyArray<{ value: boolean; labelKey: string; descKey: string }> = [
    { value: true, labelKey: `${K}.onLabel`, descKey: `${K}.onDesc` },
    { value: false, labelKey: `${K}.offLabel`, descKey: `${K}.offDesc` },
  ];

  return (
    <div
      data-testid="runs-events-card"
      className="mb-2 rounded-admin-lg border border-admin-border-soft bg-admin-card p-4"
    >
      <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.title`)}</div>
      <div className="mt-0.5 text-[12px] text-admin-ink-muted">{t(`${K}.desc`)}</div>

      {loadError ? (
        <div className="mt-2 text-[11px] text-admin-critical">{loadError}</div>
      ) : current === null ? (
        <div className="mt-2 text-[11px] text-admin-ink-muted">{t(`${K}.loading`)}</div>
      ) : (
        <div role="radiogroup" aria-label={t(`${K}.title`)} className="mt-3 flex flex-col gap-2 sm:flex-row">
          {options.map((option) => {
            const active = current === option.value;
            return (
              <button
                key={String(option.value)}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!canEdit || busy}
                onClick={() => onPick(option.value)}
                className={`flex-1 min-w-0 rounded-admin-md border p-3 text-left transition-colors ${
                  active ? "border-admin-accent bg-admin-accent-soft" : "border-admin-border bg-admin-surface"
                } ${canEdit && !busy ? "cursor-pointer hover:border-admin-border-strong" : "cursor-default opacity-70"}`}
              >
                <div className="text-[13px] font-semibold text-admin-ink">{t(option.labelKey)}</div>
                <div className="mt-0.5 text-[12px] text-admin-ink-muted">{t(option.descKey)}</div>
              </button>
            );
          })}
        </div>
      )}

      {busy && <div className="mt-2 text-[11px] text-admin-ink-muted">{t(`${K}.saving`)}</div>}
      {saved && !busy && <div className="mt-2 text-[11px] text-admin-success">{t(`${K}.saved`)}</div>}
      {error && !busy && <div className="mt-2 text-[11px] text-admin-critical">{error}</div>}
      {!canEdit && <div className="mt-2 text-[11px] text-admin-ink-muted">{t(`${K}.ownerOnly`)}</div>}
    </div>
  );
}
