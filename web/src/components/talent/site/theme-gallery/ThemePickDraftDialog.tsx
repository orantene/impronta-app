"use client";

/**
 * TUL-321 — confirm step for picking a new Design in the Manager gallery.
 * Replaces window.confirm. Shows the same keep/change summary as
 * PublishDesignDialog (shared body) and says plainly that this only changes
 * the DRAFT. The primary button never says "Publish";
 * "Change and publish now" is the secondary action (one rule for both paths:
 * a design change goes to draft first).
 */
import { DesignChangeSummaryBody } from "../maison-setup/DesignChangeSummaryBody";
import type { LiveDesignChangeSummary } from "../maison-setup/live-design-change";
import { themeGalleryCopy, type ThemeGalleryLocale } from "./theme-gallery-i18n";

export function ThemePickDraftDialog({
  locale,
  summary,
  onConfirm,
  onPublishNow,
  onCancel,
}: {
  locale: ThemeGalleryLocale;
  summary: LiveDesignChangeSummary;
  onConfirm: () => void;
  onPublishNow: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 md:items-center"
      data-testid="theme-pick-draft-dialog"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="theme-pick-draft-title"
        className="w-full max-w-[520px] rounded-t-2xl bg-white px-5 pb-6 pt-4 shadow-lg md:rounded-2xl md:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="theme-pick-draft-title" className="text-[18px] font-semibold text-admin-ink">
            {themeGalleryCopy(locale, "draftDialogTitle")}
          </h2>
          <button
            type="button"
            aria-label={themeGalleryCopy(locale, "draftDialogClose")}
            onClick={onCancel}
            className="-mr-2 -mt-1 inline-flex min-h-11 min-w-11 items-center justify-center text-[18px] text-admin-ink-muted"
          >
            ✕
          </button>
        </div>
        <p
          className="mt-2 text-[13px] font-medium leading-relaxed text-admin-ink"
          data-testid="theme-pick-draft-note"
        >
          {themeGalleryCopy(locale, "draftDialogNote")}
        </p>
        <DesignChangeSummaryBody locale={locale} summary={summary} />
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            data-testid="theme-pick-draft-confirm"
            onClick={onConfirm}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-emerald-900 px-4 text-[14px] font-semibold text-white"
          >
            {themeGalleryCopy(locale, "draftDialogConfirm")}
          </button>
          <button
            type="button"
            data-testid="theme-pick-draft-publish-now"
            onClick={onPublishNow}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-admin-border-soft px-4 text-[14px] font-semibold text-admin-ink"
          >
            {themeGalleryCopy(locale, "draftDialogPublishNow")}
          </button>
          <button
            type="button"
            data-testid="theme-pick-draft-keep"
            onClick={onCancel}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-admin-border-soft px-4 text-[14px] font-semibold text-admin-ink"
          >
            {themeGalleryCopy(locale, "draftDialogKeep")}
          </button>
        </div>
      </div>
    </div>
  );
}
