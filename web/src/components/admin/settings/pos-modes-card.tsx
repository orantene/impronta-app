"use client";

/**
 * PosModesSettingsCard — the ONLY UI that writes `agencies.settings.pos
 * .locations.default.modes` (W20, money.md §2).
 *
 * Sibling in shape to `RunsEventsCard`: loads its own value with
 * `getPosModes()` rather than trusting shell state (the shell's
 * `workspacePosModes` is a layout-bridge snapshot that can be a request
 * behind), toggles save immediately, and gates writes to the owner —
 * `setPosModes` requires `manage_billing`, same bar as the workspace-type and
 * events switches this card sits beside.
 *
 * A MODE WITH NO SCREEN IS NEVER OFFERED AS A TOGGLE THAT WORKS. `floor`,
 * `door`, `classes` and `projects` render with a "not built yet" caption and
 * a disabled control instead of a switch that would silently do nothing —
 * the server action refuses the write anyway, but a control a person can
 * press that then fails is exactly the thing this settings surface exists to
 * avoid, so the disabled state is the FIRST line of defense, not the second.
 *
 * DEVICES ARE A NAMED GAP, NOT A FABRICATED LIST. money.md §3 confirms no
 * device-registry table exists anywhere in the schema. Rather than invent a
 * device picker with nothing behind it, this card states the gap in plain
 * words: every device on this workspace shares the settings above.
 */

import { useEffect, useState, useTransition } from "react";

import { useT } from "@/i18n/use-t";
import { getPosModes, setPosModes } from "@/lib/server-actions/pos-modes";
import { POS_MODES, POS_MODE_META, type PosMode } from "@/lib/pos/modes";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";

const K = "dashboard.adminWorkspace.posModes";

export function PosModesSettingsCard({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [busy, startTransition] = useTransition();

  // `null` = not loaded yet or unreadable; never rendered as "everything off".
  const [current, setCurrent] = useState<PosMode[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPosModes().then((res) => {
      if (cancelled) return;
      if (res.ok) setCurrent(res.modes);
      else setLoadError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(mode: PosMode) {
    if (!canEdit || busy || current === null) return;
    const meta = POS_MODE_META[mode];
    const isOn = current.includes(mode);
    // Never send a request that turns ON an unbuilt mode — the server would
    // refuse it too, but the toggle should already read as unusable.
    if (!meta.built && !isOn) return;
    const next = isOn ? current.filter((m) => m !== mode) : [...current, mode];
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setPosModes({ modes: next });
      if (res.ok) {
        setCurrent(res.modes);
        setSaved(true);
        queueRouterRefresh();
        return;
      }
      setError(res.error);
    });
  }

  return (
    <div data-testid="pos-modes-card" className="mb-2 rounded-admin-lg border border-admin-border-soft bg-admin-card p-4">
      <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.title`)}</div>
      <div className="mt-0.5 text-[12px] text-admin-ink-muted">{t(`${K}.desc`)}</div>

      {loadError ? (
        <div className="mt-2 text-[11px] text-admin-critical">{loadError}</div>
      ) : current === null ? (
        <div className="mt-2 text-[11px] text-admin-ink-muted">{t(`${K}.loading`)}</div>
      ) : (
        <div role="group" aria-label={t(`${K}.title`)} className="mt-3 flex flex-col gap-2">
          {POS_MODES.map((mode) => {
            const meta = POS_MODE_META[mode];
            const on = current.includes(mode);
            const disabled = !canEdit || busy || (!meta.built && !on);
            return (
              <button
                key={mode}
                type="button"
                role="switch"
                aria-checked={on}
                disabled={disabled}
                onClick={() => toggle(mode)}
                className={`flex items-center justify-between gap-3 rounded-admin-md border p-3 text-left transition-colors ${
                  on ? "border-admin-accent bg-admin-accent-soft" : "border-admin-border bg-admin-surface"
                } ${!disabled ? "cursor-pointer hover:border-admin-border-strong" : "cursor-default opacity-70"}`}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.modes.${mode}.label`)}</div>
                  <div className="mt-0.5 text-[12px] text-admin-ink-muted">
                    {meta.built ? t(`${K}.modes.${mode}.desc`) : t(`${K}.notBuiltHint`)}
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-admin-ink-muted">
                  {meta.built ? (on ? t(`${K}.onLabel`) : t(`${K}.offLabel`)) : t(`${K}.notBuiltBadge`)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {busy && <div className="mt-2 text-[11px] text-admin-ink-muted">{t(`${K}.saving`)}</div>}
      {saved && !busy && <div className="mt-2 text-[11px] text-admin-success">{t(`${K}.saved`)}</div>}
      {error && !busy && <div className="mt-2 text-[11px] text-admin-critical">{error}</div>}
      {!canEdit && <div className="mt-2 text-[11px] text-admin-ink-muted">{t(`${K}.ownerOnly`)}</div>}

      <div className="mt-4 border-t border-admin-border-soft pt-3">
        <div className="text-[12px] font-semibold text-admin-ink">{t(`${K}.devicesHeading`)}</div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-admin-ink-muted">{t(`${K}.devicesGap`)}</div>
      </div>
    </div>
  );
}
