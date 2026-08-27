"use client";

/**
 * WorkspaceTypeCard — the ONLY UI that writes `agencies.workspace_type`.
 *
 * WHAT IT IS FOR
 * ──────────────
 * PR #1363 shipped the whole `workspace_type` seam (identity payload, nav
 * filtering, route guards, and the owner-only `setWorkspaceType` action with
 * its preflight + audit write) and then shipped no way to reach it: flipping a
 * workspace to "business" meant editing the database by hand. This card is that
 * missing control and nothing else. It calls `setWorkspaceType` as-is — it does
 * not re-implement the preflight, re-count the roster, or write the audit row.
 *
 * HIDE, NEVER DELETE
 * ──────────────────
 * Switching to "business" hides the roster-shaped surfaces (Roster, Pitches).
 * It does not archive, delete, or unpublish one roster row. The confirmation
 * copy below therefore says "hidden, not deleted" and says the flip is
 * reversible, because both are literally true — see the header of
 * `lib/server-actions/workspace-type.ts`. Do not soften that into anything that
 * reads like a destructive warning, and never into one that implies deletion.
 *
 * OWNER-ONLY
 * ──────────
 * The action gates on `manage_billing` (owner-class). This component mirrors
 * the surface's existing owner pattern — `WorkspacePageView` passes
 * `canEdit={isOwner}` exactly like the Plan group swaps its manage row for a
 * read-only one. The client gate is presentation; the server gate is the real
 * one and runs regardless.
 *
 * WHY IT LIVES OUTSIDE `components/admin/shell/`
 * ──────────────────────────────────────────────
 * `WorkspacePageView.tsx` is already past the 800-line `max-lines` cap (it is
 * grandfathered in `eslint-suppressions.json`), so growing it further is the
 * exact regrowth the size ratchet exists to stop. Own file, className-only with
 * `--color-admin-*` token utilities: no `style={{…}}`, and no shadcn tokens
 * (`text-foreground` renders white-on-white on admin surfaces).
 */

import { useState, useTransition } from "react";

import { interpolate } from "@/i18n/interpolate";
import { useT } from "@/i18n/use-t";
import type { WorkspaceType } from "@/lib/saas/workspace-type";
import { setWorkspaceType } from "@/lib/server-actions/workspace-type";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";

const K = "dashboard.adminWorkspace.workspaceType";

type Option = {
  value: WorkspaceType;
  labelKey: string;
  descKey: string;
};

const OPTIONS: readonly Option[] = [
  { value: "talent", labelKey: `${K}.talentLabel`, descKey: `${K}.talentDesc` },
  { value: "business", labelKey: `${K}.businessLabel`, descKey: `${K}.businessDesc` },
];

export function WorkspaceTypeCard({
  currentType,
  canEdit,
}: {
  /** `state.workspaceType` — normalized, and re-derived from the server on refresh. */
  currentType: WorkspaceType;
  /** Owner-only. Non-owners see the same card, read-only. */
  canEdit: boolean;
}) {
  const t = useT();
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [busy, startTransition] = useTransition();

  // The target the owner picked but has not confirmed yet, plus the roster
  // count the ACTION reported for it. Never counted here — showing the owner a
  // number this component computed itself is how a "0 profiles" lie happens.
  const [confirming, setConfirming] = useState<{ target: WorkspaceType; hidden: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Optimistic only for the duration of the call; the server owns the truth. */
  const [inFlight, setInFlight] = useState<WorkspaceType | null>(null);

  const selected = inFlight ?? currentType;

  function submit(target: WorkspaceType, confirmed: boolean) {
    setError(null);
    setSaved(false);
    setInFlight(target);
    startTransition(async () => {
      const res = await setWorkspaceType({ workspace_type: target, confirm: confirmed });
      if (res.ok) {
        setConfirming(null);
        setSaved(true);
        // The nav reads `state.workspaceType`, which comes from the server
        // layout's tenant-identity payload — not from any client cache. The
        // action already `revalidatePath("/", "layout")`s; this is what makes
        // the browser pick the new payload up without a manual reload, using
        // the same coalesced refresh every other settings mutation uses.
        queueRouterRefresh();
        return;
      }
      setInFlight(null);
      if (res.requires_confirmation && res.preflight) {
        // talent → business. Park the action's own count and ask.
        setConfirming({ target, hidden: res.preflight.hidden_roster_count });
        return;
      }
      setError(res.error);
    });
  }

  function onPick(target: WorkspaceType) {
    if (!canEdit || busy || target === currentType) return;
    setConfirming(null);
    // business → talent only reveals surfaces, so it goes straight through.
    // talent → business comes back with `requires_confirmation` and opens the
    // panel below; we do not decide that here, the action does.
    submit(target, false);
  }

  const confirmCopy = confirming
    ? confirming.hidden === 0
      ? t(`${K}.confirmNone`)
      : confirming.hidden === 1
        ? t(`${K}.confirmOne`)
        : interpolate(t(`${K}.confirmOther`), { count: confirming.hidden })
    : null;

  return (
    <div
      data-testid="workspace-type-card"
      className="mb-2 rounded-admin-lg border border-admin-border-soft bg-admin-card p-4"
    >
      <div className="text-[13px] font-semibold text-admin-ink">{t(`${K}.title`)}</div>
      <div className="mt-0.5 text-[12px] text-admin-ink-muted">{t(`${K}.desc`)}</div>

      <div
        role="radiogroup"
        aria-label={t(`${K}.title`)}
        className="mt-3 flex flex-col gap-2 sm:flex-row"
      >
        {OPTIONS.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!canEdit || busy}
              onClick={() => onPick(option.value)}
              className={`flex-1 min-w-0 rounded-admin-md border p-3 text-left transition-colors ${
                active
                  ? "border-admin-accent bg-admin-accent-soft"
                  : "border-admin-border bg-admin-surface"
              } ${canEdit && !busy ? "cursor-pointer hover:border-admin-border-strong" : "cursor-default opacity-70"}`}
            >
              <div className="text-[13px] font-semibold text-admin-ink">{t(option.labelKey)}</div>
              <div className="mt-0.5 text-[12px] text-admin-ink-muted">{t(option.descKey)}</div>
            </button>
          );
        })}
      </div>

      {confirming && confirmCopy && (
        <div
          data-testid="workspace-type-confirm"
          className="mt-3 rounded-admin-md border border-admin-border bg-admin-surface-alt p-3"
        >
          <div className="text-[12.5px] font-semibold text-admin-ink">{t(`${K}.confirmTitle`)}</div>
          <div className="mt-1 text-[12px] text-admin-ink-muted">{confirmCopy}</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(confirming.target, true)}
              className="rounded-admin-sm bg-admin-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
            >
              {t(`${K}.confirmCta`)}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setConfirming(null); setError(null); }}
              className="rounded-admin-sm border border-admin-border px-3 py-1.5 text-[12px] font-semibold text-admin-ink disabled:opacity-60"
            >
              {t(`${K}.cancel`)}
            </button>
          </div>
        </div>
      )}

      {/* Explicit load/save state — no silent waits. */}
      {busy && <div className="mt-2 text-[11px] text-admin-ink-muted">{t(`${K}.saving`)}</div>}
      {saved && !busy && <div className="mt-2 text-[11px] text-admin-success">{t(`${K}.saved`)}</div>}
      {error && !busy && <div className="mt-2 text-[11px] text-admin-critical">{error}</div>}
      {!canEdit && <div className="mt-2 text-[11px] text-admin-ink-muted">{t(`${K}.ownerOnly`)}</div>}
    </div>
  );
}
