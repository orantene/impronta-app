"use client";

/**
 * OfferSaveBanner — W0-1 sticky save-state surface for the offer editor.
 *
 * Renders nothing while idle/saved-clean; a quiet "Guardado · hh:mm" tick right
 * after a save; and a STICKY danger banner while a save is failing that persists
 * until the next success (unlike the old 4s toast). The banner speaks the human
 * reason mapped from the engine error (offer-save-state.classifySaveError) and
 * exposes Reintentar for retryable failures. Auth failures are handled by the
 * parent (local snapshot + re-login), so here they render as a distinct message
 * without a bare retry.
 *
 * Styling uses admin tokens via className (no new inline styles — admin-shell
 * ratchet), matching the drawer alert pattern.
 */

import type { OfferSaveState } from "./offer-save-state";
import { useT } from "@/i18n/use-t";

export function OfferSaveBanner({
  state,
  onRetry,
}: {
  state: OfferSaveState;
  onRetry: () => void;
}) {
  const t = useT();

  if (state.status === "saved") {
    const hhmm = new Date(state.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return (
      <div
        className="text-admin-ink-muted text-admin-11 flex items-center gap-1.5 px-1 py-0.5"
        aria-live="polite"
      >
        <span aria-hidden>✓</span>
        {t("dashboard.adminTabs.lineup.savedAt").replace("{time}", hhmm)}
      </div>
    );
  }

  if (state.status === "saving") {
    return (
      <div className="text-admin-ink-muted text-admin-11 px-1 py-0.5" aria-live="polite">
        {t("dashboard.adminTabs.lineup.saving")}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div
        role="alert"
        className="bg-admin-coral-soft border border-admin-coral text-admin-ink rounded-admin-md px-3 py-2 flex items-center gap-2 text-admin-12"
      >
        <span aria-hidden className="text-admin-coral-deep font-bold">!</span>
        <span className="flex-1">{t(state.cls.messageKey)}</span>
        {state.cls.retryable && state.cls.kind !== "auth" ? (
          <button
            type="button"
            onClick={onRetry}
            className="text-admin-coral-deep font-semibold underline underline-offset-2"
          >
            {t("dashboard.adminTabs.lineup.retry")}
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}

/**
 * OfferStatusChip — W0-4 compact, always-in-header save-state pill, companion to
 * OfferSaveBanner. Reads the same OfferSaveState so the two never disagree: the
 * chip is the glanceable status next to the editor title, the banner is the
 * fuller (and, on error, sticky) surface below. Renders nothing while idle
 * (before the first save) so the header stays quiet until there's state to show.
 */
export function OfferStatusChip({ state }: { state: OfferSaveState }) {
  const t = useT();

  if (state.status === "saving") {
    return (
      <span
        className="bg-admin-surface-alt text-admin-ink-muted rounded-admin-md inline-flex items-center gap-1 px-1.5 py-0.5 text-admin-11"
        aria-live="polite"
      >
        <span aria-hidden className="animate-pulse">●</span>
        {t("dashboard.adminTabs.lineup.chipSaving")}
      </span>
    );
  }

  if (state.status === "saved") {
    return (
      <span
        className="bg-admin-success-soft text-admin-success-deep rounded-admin-md inline-flex items-center gap-1 px-1.5 py-0.5 text-admin-11"
        aria-live="polite"
      >
        <span aria-hidden>✓</span>
        {t("dashboard.adminTabs.lineup.chipSaved")}
      </span>
    );
  }

  if (state.status === "error") {
    return (
      <span
        role="status"
        className="bg-admin-coral-soft text-admin-coral-deep rounded-admin-md inline-flex items-center gap-1 px-1.5 py-0.5 text-admin-11 font-semibold"
      >
        <span aria-hidden>!</span>
        {t("dashboard.adminTabs.lineup.chipError")}
      </span>
    );
  }

  return null;
}
