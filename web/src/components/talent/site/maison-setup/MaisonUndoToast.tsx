"use client";

/**
 * Success toast with a real Undo control. Undo calls the same server action
 * as Review's Undo button (undoMaisonDesignAction), which restores the
 * snapshot captured by apply / reset / reapply / restore.
 */
import { useTransition, useState } from "react";
import { undoMaisonDesignAction } from "@/lib/talent-site/server/maison-apply-actions";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

export function MaisonUndoToast({
  locale,
  message,
  testId,
  onUndone,
}: {
  locale: MaisonSetupLocale;
  message: string;
  testId: string;
  onUndone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUndo() {
    startTransition(async () => {
      setError(null);
      const res = await undoMaisonDesignAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onUndone();
    });
  }

  return (
    <div
      data-testid={testId}
      role="status"
      className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-900"
    >
      <span>✓ {message}</span>
      <button
        type="button"
        data-testid={`${testId}-undo`}
        disabled={pending}
        onClick={handleUndo}
        className="inline-flex min-h-9 items-center rounded-lg border border-emerald-300 bg-white px-3 text-[13px] font-semibold text-emerald-900 disabled:opacity-50"
      >
        {maisonSetupT(locale, "Undo")}
      </button>
      {error ? (
        <span className="w-full text-[12px] font-normal text-red-800">{error}</span>
      ) : null}
    </div>
  );
}
