"use client";

/**
 * P5 — "Publish <Design>?" on a LIVE site (cr_ex_publish): one combined
 * review + publish step. Desktop modal 520px, phone bottom sheet with
 * Publish changes on top. No second confirmation.
 */

import type { LiveDesignChangeSummary } from "./live-design-change";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Props = {
  locale: MaisonSetupLocale;
  summary: LiveDesignChangeSummary;
  pending: boolean;
  error: string | null;
  onPublish: () => void;
  onKeepEditing: () => void;
};

export function PublishDesignDialog({
  locale,
  summary,
  pending,
  error,
  onPublish,
  onKeepEditing,
}: Props) {
  const es = locale === "es";
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 md:items-center"
      data-testid="maison-publish-design-dialog"
      role="presentation"
      onClick={pending ? undefined : onKeepEditing}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="maison-publish-design-title"
        className="w-full max-w-[520px] rounded-t-2xl bg-white px-5 pb-6 pt-4 shadow-lg md:rounded-2xl md:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-black/15 md:hidden" />
        <div className="flex items-start justify-between gap-3">
          <h2
            id="maison-publish-design-title"
            className="text-[18px] font-semibold text-admin-ink"
          >
            {summary.title}
          </h2>
          <button
            type="button"
            aria-label={es ? "Cerrar" : "Close"}
            data-testid="maison-publish-design-close"
            disabled={pending}
            onClick={onKeepEditing}
            className="-mr-2 -mt-1 inline-flex min-h-11 min-w-11 items-center justify-center text-[18px] text-admin-ink-muted"
          >
            ✕
          </button>
        </div>

        <p className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-dim">
          {es ? "Qué cambia" : "What changes"}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-admin-ink" data-testid="maison-design-changes">
          {summary.changes}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-admin-ink" data-testid="maison-design-colors-note">
          {summary.colorsNote}
        </p>

        <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-admin-ink-dim">
          {es ? "Qué se queda" : "What stays"}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-admin-ink-muted" data-testid="maison-design-stays">
          {summary.stays}
        </p>

        {error ? (
          <p className="mt-3 text-[12px] text-red-800" data-testid="maison-publish-design-error">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            data-testid="maison-publish-design-confirm"
            disabled={pending}
            onClick={onPublish}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-emerald-900 px-4 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {pending
              ? maisonSetupT(locale, "Publishing…")
              : maisonSetupT(locale, "Publish changes")}
          </button>
          <button
            type="button"
            data-testid="maison-publish-design-keep"
            disabled={pending}
            onClick={onKeepEditing}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-admin-border-soft px-4 text-[14px] font-semibold text-admin-ink disabled:opacity-50"
          >
            {maisonSetupT(locale, "Keep editing")}
          </button>
        </div>
      </div>
    </div>
  );
}
