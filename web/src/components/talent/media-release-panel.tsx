"use client";

/**
 * media-release-panel.tsx — "From your agencies" (media-ownership phase 3).
 *
 * The talent's view of the two-key rule. Photos a workspace owns OF THEM show
 * up here as LOCKED TILES: visible, never hidden, but not usable outside that
 * workspace's own site until the workspace releases them.
 *
 * Two product rules drive the whole design:
 *
 *   • Visible, not usable. A locked photo is shown, not silently dropped —
 *     "no tile" would read as "no answer", and a talent who cannot see the
 *     photo cannot ask for it. Same reasoning as the phase 1 ownership chip.
 *   • Every lock is explained in plain language, with a way forward
 *     ("Request release") rather than a dead end.
 *
 * Talent-owned photos are deliberately NOT listed here: nothing about them is
 * locked, so a tile for them would be noise. They live in the normal gallery.
 *
 * Lives outside `components/admin/shell/**` on purpose — that tree is frozen
 * against new inline styles. Tailwind admin-* tokens only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  actionLoadTalentMediaLocks,
  actionRequestMediaRelease,
  type TalentMediaLock,
} from "@/lib/server-actions/talent-media-release";

type RequestState = "idle" | "sending" | "sent" | "error";

export function MediaReleasePanel({ talentProfileId }: { talentProfileId: string }) {
  const t = useT();
  const [locks, setLocks] = useState<TalentMediaLock[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<RequestState>("idle");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLocks(null);
    setLoadError(null);
    const res = await actionLoadTalentMediaLocks(talentProfileId);
    if (!res.ok) {
      setLoadError(res.error);
      setLocks([]);
      return;
    }
    setLocks(res.data);
    setSelected([]);
  }, [talentProfileId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  /**
   * One request per owning workspace — a single ask cannot span two owners,
   * because only one of them can answer it.
   */
  const ownerOfSelection = useMemo(() => {
    if (!locks || selected.length === 0) return null;
    const owners = new Set(
      locks.filter((l) => selected.includes(l.assetId)).map((l) => l.ownerTenantId),
    );
    return owners.size === 1 ? [...owners][0] : null;
  }, [locks, selected]);

  const toggle = (lock: TalentMediaLock) => {
    if (lock.pending || lock.released) return;
    setState("idle");
    setError(null);
    setSelected((prev) =>
      prev.includes(lock.assetId)
        ? prev.filter((id) => id !== lock.assetId)
        : [...prev, lock.assetId],
    );
  };

  const sendRequest = async () => {
    if (!ownerOfSelection) return;
    setState("sending");
    setError(null);
    const res = await actionRequestMediaRelease({
      talentProfileId,
      ownerTenantId: ownerOfSelection,
      // null = "anywhere". The workspace still approves, and can revoke later.
      targetTenantId: null,
      assetIds: selected,
      message: null,
    });
    if (!res.ok) {
      setState("error");
      setError(res.error);
      return;
    }
    setState("sent");
    await load();
  };

  const mixedOwners = selected.length > 0 && ownerOfSelection === null;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-admin-border-soft bg-admin-indigo-soft p-3">
        <div className="text-[12.5px] font-semibold text-admin-indigo-deep">
          {t("dashboard.mediaRelease.title")}
        </div>
        <div className="mt-1 text-[11.5px] leading-relaxed text-admin-ink-muted">
          {t("dashboard.mediaRelease.body")}
        </div>
      </div>

      {locks === null && (
        <div className="text-[12px] text-admin-ink-muted">{t("dashboard.mediaRelease.loading")}</div>
      )}

      {loadError && (
        <div className="rounded-lg border border-admin-border bg-admin-surface-alt p-3 text-[12px] text-admin-red">
          {loadError}
        </div>
      )}

      {locks !== null && locks.length === 0 && !loadError && (
        <div className="rounded-lg border border-dashed border-admin-border bg-admin-surface-alt p-4 text-center text-[12px] text-admin-ink-muted">
          {t("dashboard.mediaRelease.empty")}
        </div>
      )}

      {locks !== null && locks.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {locks.map((lock) => {
            const isSelected = selected.includes(lock.assetId);
            const actionable = !lock.pending && !lock.released;
            const status = lock.released
              ? t("dashboard.mediaRelease.statusReleased")
              : lock.pending
                ? t("dashboard.mediaRelease.statusPending")
                : t("dashboard.mediaRelease.statusLocked").replace(
                    "{workspace}",
                    lock.ownerTenantName,
                  );
            return (
              <div
                key={lock.assetId}
                className={`relative overflow-hidden rounded-lg border ${
                  isSelected ? "border-admin-indigo-deep" : "border-admin-border-soft"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(lock)}
                  disabled={!actionable}
                  aria-pressed={isSelected}
                  className="block w-full cursor-pointer bg-admin-surface-alt disabled:cursor-not-allowed"
                  title={status}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- media-public URLs are pre-cropped; the shell renders them as plain img everywhere. */}
                  <img
                    src={lock.url}
                    alt={lock.alt}
                    loading="lazy"
                    className={`aspect-[3/4] w-full object-cover ${
                      lock.released ? "" : "opacity-60"
                    }`}
                  />
                </button>

                {!lock.released && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-admin-ink-dim px-1.5 py-0.5 text-[10px] font-bold text-white"
                  >
                    {t("dashboard.mediaRelease.lockBadge")}
                  </span>
                )}
                {isSelected && (
                  <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-admin-indigo-deep px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {t("dashboard.mediaRelease.selectedBadge")}
                  </span>
                )}

                <div className="border-t border-admin-border-soft bg-admin-surface px-2 py-1 text-[10.5px] leading-snug text-admin-ink-dim">
                  {status}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {locks !== null && locks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={sendRequest}
            disabled={selected.length === 0 || mixedOwners || state === "sending"}
            className="cursor-pointer rounded-lg bg-admin-indigo-deep px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-admin-fill disabled:text-admin-ink-muted"
          >
            {state === "sending"
              ? t("dashboard.mediaRelease.sending")
              : t("dashboard.mediaRelease.request")}
          </button>
          <span className="text-[11.5px] text-admin-ink-muted">
            {mixedOwners
              ? t("dashboard.mediaRelease.mixedOwners")
              : state === "sent"
                ? t("dashboard.mediaRelease.sent")
                : t("dashboard.mediaRelease.selectedCount").replace(
                    "{count}",
                    String(selected.length),
                  )}
          </span>
          {error && <span className="text-[11.5px] text-admin-red">{error}</span>}
        </div>
      )}
    </div>
  );
}
