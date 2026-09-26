"use client";

/**
 * W69–W70, W73–W74 — Design options sheet: reset / reapply / discard /
 * undo import / restore previous. One line per action.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  discardMaisonLivePendingAction,
  loadMaisonDesignOptionsStateAction,
  reapplyMaisonDemoLayoutAction,
  resetMaisonColorsAction,
  restoreMaisonDesignRevisionAction,
  type MaisonDesignOptionsState,
} from "@/lib/talent-site/server/maison-options-actions";
import { undoMaisonImportAction } from "@/lib/talent-site/server/maison-import-actions";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Props = {
  locale: MaisonSetupLocale;
  open: boolean;
  onClose: () => void;
  /** After restore → open Review with restored draft (W70). */
  onRestoredToReview: () => void;
  onChanged?: () => void;
};

export function DesignOptionsPanel({
  locale,
  open,
  onClose,
  onRestoredToReview,
  onChanged,
}: Props) {
  const [state, setState] = useState<MaisonDesignOptionsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadMaisonDesignOptionsStateAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setState(res.data);
      setError(null);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    setShowRestore(false);
    reload();
  }, [open, reload]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!open) return null;

  const es = locale === "es";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okToast: string) {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setToast(okToast);
      onChanged?.();
      reload();
    });
  }

  function handleReset() {
    run(
      async () => resetMaisonColorsAction(),
      maisonSetupT(locale, "Colors reset to draft · Undo"),
    );
  }

  function handleReapply() {
    run(
      async () => reapplyMaisonDemoLayoutAction(),
      maisonSetupT(locale, "Demo layout reapplied · Undo"),
    );
  }

  function handleDiscard() {
    run(
      async () => discardMaisonLivePendingAction(),
      maisonSetupT(locale, "Unpublished design changes discarded"),
    );
  }

  function handleUndoImport() {
    if (!state?.importBatch) return;
    const batchId = state.importBatch.batchId;
    run(async () => {
      const res = await undoMaisonImportAction({ batchId });
      return res;
    }, maisonSetupT(locale, "Import undone"));
  }

  function handleRestore(revisionId: string) {
    startTransition(async () => {
      setError(null);
      const res = await restoreMaisonDesignRevisionAction({ revisionId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToast(maisonSetupT(locale, "Previous design restored to your draft · Undo"));
      onChanged?.();
      onClose();
      onRestoredToReview();
    });
  }

  const importLine = state?.importBatch
    ? es
      ? `Quita los ${state.importBatch.draftCount} borradores del import.`
      : `Removes the ${state.importBatch.draftCount} drafts from the import.`
    : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 md:items-center"
      data-testid="maison-design-options"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="maison-design-options-title"
        className="max-h-[90vh] w-full max-w-[480px] overflow-auto rounded-t-2xl bg-white px-5 pb-6 pt-4 shadow-lg md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-black/15 md:hidden" />
        <div className="flex items-start justify-between gap-3">
          <h2
            id="maison-design-options-title"
            className="text-[18px] font-semibold text-admin-ink"
          >
            {maisonSetupT(locale, "Design options")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 text-[13px] font-semibold text-admin-ink-muted"
          >
            {maisonSetupT(locale, "Close")}
          </button>
        </div>

        {toast ? (
          <p
            data-testid="maison-options-toast"
            className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900"
          >
            {toast}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-[12px] text-red-800" data-testid="maison-options-error">
            {error}
          </p>
        ) : null}

        {!showRestore ? (
          <ul className="mt-4 divide-y divide-admin-border-soft" data-testid="maison-options-list">
            <OptionRow
              testId="maison-option-reset-colors"
              title={maisonSetupT(locale, "Reset colors")}
              line={maisonSetupT(
                locale,
                "Back to the demo colors, Pink & Lipstick.",
              )}
              actionLabel={maisonSetupT(locale, "Reset")}
              disabled={pending}
              onAction={handleReset}
            />
            <OptionRow
              testId="maison-option-reapply-layout"
              title={maisonSetupT(locale, "Reapply demo layout")}
              line={maisonSetupT(
                locale,
                "Section order and menu style return to the demo's. Your content stays.",
              )}
              actionLabel={maisonSetupT(locale, "Reapply")}
              disabled={pending}
              onAction={handleReapply}
            />
            {state?.canDiscard ? (
              <OptionRow
                testId="maison-option-discard"
                title={maisonSetupT(locale, "Discard design changes")}
                line={maisonSetupT(locale, "Drop unpublished design changes.")}
                actionLabel={maisonSetupT(locale, "Discard")}
                disabled={pending}
                onAction={handleDiscard}
              />
            ) : (
              <li
                data-testid="maison-option-discard-idle"
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-[14px] font-semibold text-admin-ink">
                    {maisonSetupT(locale, "Discard design changes")}
                  </p>
                  <p className="text-[13px] text-admin-ink-muted">
                    {maisonSetupT(locale, "No unpublished design changes right now.")}
                  </p>
                </div>
                {/* W73 — never a dead Discard button when there is nothing to discard */}
              </li>
            )}
            {state?.importBatch && importLine ? (
              <OptionRow
                testId="maison-option-undo-import"
                title={maisonSetupT(locale, "Undo import")}
                line={importLine}
                actionLabel={maisonSetupT(locale, "Undo")}
                disabled={pending}
                onAction={handleUndoImport}
              />
            ) : null}
            <OptionRow
              testId="maison-option-restore"
              title={maisonSetupT(locale, "Restore previous design")}
              line={maisonSetupT(
                locale,
                "Bring back a published version as a draft.",
              )}
              actionLabel={maisonSetupT(locale, "Choose")}
              disabled={pending || !state?.revisions.length}
              onAction={() => setShowRestore(true)}
            />
          </ul>
        ) : (
          <div className="mt-4" data-testid="maison-restore-list">
            <button
              type="button"
              className="mb-3 text-[13px] font-semibold text-emerald-900"
              onClick={() => setShowRestore(false)}
            >
              ‹ {maisonSetupT(locale, "Design options")}
            </button>
            <p className="mb-3 text-[13px] text-admin-ink-muted">
              {maisonSetupT(
                locale,
                "Restoring puts that design in your draft. The live site changes only when you publish.",
              )}
            </p>
            <ul className="divide-y divide-admin-border-soft">
              {(state?.revisions ?? []).map((rev) => (
                <li
                  key={rev.id}
                  data-testid={`maison-restore-rev-${rev.version}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-[14px] font-semibold text-admin-ink">{rev.summary}</p>
                    {rev.isLive ? (
                      <p className="text-[12px] font-semibold text-emerald-800">● Live now</p>
                    ) : null}
                  </div>
                  {!rev.isLive ? (
                    <button
                      type="button"
                      data-testid={`maison-restore-btn-${rev.version}`}
                      disabled={pending}
                      onClick={() => handleRestore(rev.id)}
                      className="inline-flex min-h-11 items-center rounded-xl border border-admin-border-soft px-3 text-[13px] font-semibold text-admin-ink disabled:opacity-50"
                    >
                      {maisonSetupT(locale, "Restore")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionRow({
  testId,
  title,
  line,
  actionLabel,
  disabled,
  onAction,
}: {
  testId: string;
  title: string;
  line: string;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <li
      data-testid={testId}
      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-admin-ink">{title}</p>
        <p className="text-[13px] text-admin-ink-muted">{line}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onAction}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-admin-border-soft px-4 text-[13px] font-semibold text-admin-ink disabled:opacity-50"
      >
        {actionLabel}
      </button>
    </li>
  );
}
