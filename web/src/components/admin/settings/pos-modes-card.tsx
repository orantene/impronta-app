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
 * TURNING THE LAST MODE OFF IS A REAL, PERSISTED STATE. The counter is the
 * only mode with screens, so it is the only switch that moves, and the empty
 * list it writes used to be coerced straight back to `["counter"]` by
 * `enabledPosModesFromSettings` — the card said "Saved", drew the switch off,
 * and the refresh it triggered repainted the rest of the page from the
 * coerced value, so one screen disagreed with itself and no reachable change
 * could ever persist. The reader now keeps `[]`, this card says in plain
 * words what an empty list costs (`allOffHint`), and the point of sale is
 * genuinely unavailable until a mode goes back on.
 *
 * A MODE WITH NO SCREEN IS NEVER OFFERED AS A TOGGLE THAT WORKS. `door`,
 * `classes` and `projects` render with a "not built yet" caption and
 * a disabled control instead of a switch that would silently do nothing —
 * the server action refuses the write anyway, but a control a person can
 * press that then fails is exactly the thing this settings surface exists to
 * avoid, so the disabled state is the FIRST line of defense, not the second.
 *
 * EVERY REFUSAL IS A CODE THE CARD TRANSLATES. `setPosModes` answers with a
 * `PosModesRefusal` id, never English prose, so a Spanish or French operator
 * reads the reason in their own language. A load that never resolves at all
 * (a dropped connection, a deploy mid-request) is its own state with its own
 * sentence and a way out, rather than a card stuck on "Loading…" forever.
 *
 * DEVICES ARE A NAMED GAP, NOT A FABRICATED LIST. money.md §3 confirms no
 * device-registry table exists anywhere in the schema. Rather than invent a
 * device picker with nothing behind it, this card states the gap in plain
 * words: every device on this workspace shares the settings above.
 */

import { useEffect, useState, useTransition } from "react";

import { useT } from "@/i18n/use-t";
import { getPosModes, setPosModes } from "@/lib/server-actions/pos-modes";
import { CLIENT_LOAD_REFUSAL, type ClientLoadRefusal, type PosModesRefusal } from "@/lib/settings/refusals";
import { POS_MODES, POS_MODE_META, type PosMode } from "@/lib/pos/modes";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";

const K = "dashboard.adminWorkspace.posModes";

/** A server refusal, or the one failure that never reaches the server at all. */
type CardRefusal = PosModesRefusal | ClientLoadRefusal;

export function PosModesSettingsCard({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [busy, startTransition] = useTransition();

  // `null` = not loaded yet or unreadable; never rendered as "everything off".
  const [current, setCurrent] = useState<PosMode[] | null>(null);
  const [loadRefusal, setLoadRefusal] = useState<CardRefusal | null>(null);
  const [refusal, setRefusal] = useState<CardRefusal | null>(null);
  const [saved, setSaved] = useState(false);

  // Bumping this re-runs the load effect, so a retry goes through the SAME
  // cancellation path as the first attempt rather than starting a second,
  // uncancellable request that outlives the card.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadRefusal(null);
    void getPosModes()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setCurrent(res.modes);
        else setLoadRefusal(res.reason);
      })
      // Without this the promise rejects unhandled and the card sits on
      // "Loading…" for the rest of the session with nothing to press.
      .catch(() => {
        if (!cancelled) setLoadRefusal(CLIENT_LOAD_REFUSAL);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  function toggle(mode: PosMode) {
    if (!canEdit || busy || current === null) return;
    const meta = POS_MODE_META[mode];
    const isOn = current.includes(mode);
    // Never send a request that turns ON an unbuilt mode — the server would
    // refuse it too, but the toggle should already read as unusable.
    if (!meta.built && !isOn) return;
    const next = isOn ? current.filter((m) => m !== mode) : [...current, mode];
    setRefusal(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const res = await setPosModes({ modes: next });
        if (res.ok) {
          setCurrent(res.modes);
          setSaved(true);
          queueRouterRefresh();
          return;
        }
        setRefusal(res.reason);
      } catch {
        setRefusal(CLIENT_LOAD_REFUSAL);
      }
    });
  }

  return (
    <div data-testid="pos-modes-card" className="mb-2 rounded-admin-lg border border-admin-border-soft bg-admin-card p-4">
      <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.title`)}</div>
      <div className="mt-0.5 text-[12px] text-admin-ink-muted">{t(`${K}.desc`)}</div>

      {loadRefusal ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-admin-critical">{t(`${K}.errors.${loadRefusal}`)}</span>
          <button
            type="button"
            onClick={() => setReloadToken((n) => n + 1)}
            className="min-h-8 rounded-admin-md border border-admin-border bg-admin-surface px-2.5 text-[11px] font-semibold text-admin-ink"
          >
            {t(`${K}.retry`)}
          </button>
        </div>
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

      {current !== null && current.length === 0 && (
        <div data-testid="pos-modes-all-off" className="mt-2 text-[11.5px] leading-relaxed text-admin-ink-muted">
          {t(`${K}.allOffHint`)}
        </div>
      )}

      {busy && <div className="mt-2 text-[11px] text-admin-ink-muted">{t(`${K}.saving`)}</div>}
      {saved && !busy && <div className="mt-2 text-[11px] text-admin-success">{t(`${K}.saved`)}</div>}
      {refusal && !busy && <div className="mt-2 text-[11px] text-admin-critical">{t(`${K}.errors.${refusal}`)}</div>}
      {!canEdit && <div className="mt-2 text-[11px] text-admin-ink-muted">{t(`${K}.ownerOnly`)}</div>}

      <div className="mt-4 border-t border-admin-border-soft pt-3">
        <div className="text-[12px] font-semibold text-admin-ink">{t(`${K}.devicesHeading`)}</div>
        <div className="mt-0.5 text-[11.5px] leading-relaxed text-admin-ink-muted">{t(`${K}.devicesGap`)}</div>
      </div>
    </div>
  );
}
