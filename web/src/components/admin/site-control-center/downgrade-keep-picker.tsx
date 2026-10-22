"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { toggleKeepSelection } from "@/lib/billing/downgrade-keep-list";
import type { DowngradePreflight } from "@/lib/server-actions/admin-plan-downgrade";

/**
 * TUL-1291 · the owner's keep-list picker for a downgrade to Free. Shown only after the owner-gated plan action said the
 * roster is above the Free cap. The server re-validates every id against the tenant's own roster; this component only
 * collects the choice (defaults to the longest-standing talent so the common case is one click).
 */
export function DowngradeKeepPicker({
  open,
  preflight,
  loading,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  preflight: DowngradePreflight | null;
  loading: boolean;
  pending: boolean;
  onConfirm: (keepIds: string[]) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const cap = preflight?.talent.target_cap ?? 0;
  const candidates = React.useMemo(() => {
    const rows = preflight?.talent.candidates ?? [];
    // Oldest first: the preflight lists newest first.
    return [...rows].sort((a, b) => (a.added_at ?? "").localeCompare(b.added_at ?? ""));
  }, [preflight]);
  const [selected, setSelected] = React.useState<string[]>([]);

  React.useEffect(() => {
    setSelected(candidates.slice(0, cap).map((c) => c.talent_profile_id));
  }, [candidates, cap]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/55" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[111] flex max-h-[85vh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl border border-border bg-background p-6 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">{t("dashboard.adminShared.planChange.keepTitle")}</Dialog.Title>
          {loading || !preflight ? (
            <Dialog.Description className="text-sm text-muted-foreground">
              {t("dashboard.adminShared.planChange.keepLoading")}
            </Dialog.Description>
          ) : (
            <>
              <Dialog.Description className="text-sm text-muted-foreground">
                {interpolate(t("dashboard.adminShared.planChange.keepIntro"), { cap, count: preflight.talent.current_count })}
              </Dialog.Description>
              <p className="text-sm font-medium" aria-live="polite">
                {interpolate(t("dashboard.adminShared.planChange.keepCounter"), { selected: selected.length, cap })}
              </p>
              <ul className="flex min-h-0 flex-col gap-1 overflow-y-auto">
                {candidates.map((c) => {
                  const checked = selected.includes(c.talent_profile_id);
                  const atCap = !checked && selected.length >= cap;
                  return (
                    <li key={c.talent_profile_id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={checked}
                          disabled={pending || atCap}
                          onChange={() => setSelected((s) => toggleKeepSelection(s, c.talent_profile_id, cap))}
                        />
                        <span className="min-w-0 truncate text-sm">
                          {c.display_name ?? t("dashboard.adminShared.planChange.keepUnnamed")}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border px-4 text-sm"
              disabled={pending}
              onClick={onCancel}
            >
              {t("dashboard.adminShared.planChange.keepCancel")}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg bg-foreground px-4 text-sm font-medium text-background disabled:opacity-50"
              disabled={pending || loading || !preflight || selected.length === 0 || selected.length > cap}
              onClick={() => onConfirm(selected)}
            >
              {pending ? t("dashboard.adminShared.planChange.keepSaving") : t("dashboard.adminShared.planChange.keepConfirm")}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
