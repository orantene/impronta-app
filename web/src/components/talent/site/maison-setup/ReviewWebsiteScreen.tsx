"use client";

/**
 * Review your website (W37–W39, W42, W72, W76) — readiness + Publish.
 * Desktop: preview + 360px panel. Phone: preview + card + sticky Publish.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  loadMaisonReviewStateAction,
  type MaisonReviewState,
} from "@/lib/talent-site/server/maison-review-actions";
import { undoMaisonDesignAction } from "@/lib/talent-site/server/maison-apply-actions";
import { publishMaxSiteAction } from "@/lib/talent-site/server/site-management-actions";
import { maisonReadinessHeadline } from "@/lib/talent-site/server/maison-publish-readiness";
import { maisonPaletteLookTokens } from "@/lib/talent-site/theme-catalog/maison/seed";
import { maisonCustomLookTokens } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { ThemeGalleryPreviewFrame } from "@/components/talent/site/theme-gallery/ThemeGalleryPreviewFrame";
import { useThemePreview } from "@/components/talent/site/theme-gallery/useThemePreview";
import type { MaisonSetupChoices } from "./maison-choices";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Props = {
  locale: MaisonSetupLocale;
  talentProfileId: string;
  choices: MaisonSetupChoices;
  onChange: (next: Partial<MaisonSetupChoices>) => void;
  onBackToDetail: () => void;
  onPublished: () => void;
};

export function ReviewWebsiteScreen({
  locale,
  talentProfileId,
  choices,
  onChange,
  onBackToDetail,
  onPublished,
}: Props) {
  const [state, setState] = useState<MaisonReviewState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<{ message: string; code: string } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const preview = useThemePreview({ talentProfileId, locale });
  const previewUrl = preview.src("maison", `maison-${choices.paletteKey}`);

  useEffect(() => {
    if (choices.useCustomPalette && choices.customPalette) {
      preview.sendTokens(maisonCustomLookTokens(choices.customPalette));
    } else {
      preview.sendTokens(maisonPaletteLookTokens(choices.paletteKey));
    }
  }, [
    choices.paletteKey,
    choices.useCustomPalette,
    choices.customPalette,
    preview,
  ]);

  const reload = useCallback(() => {
    startTransition(async () => {
      const res = await loadMaisonReviewStateAction({
        contentMode: choices.contentMode,
        locale,
      });
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setState(res.data);
      setLoadError(null);
    });
  }, [choices.contentMode, locale]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  function handleUndo() {
    startTransition(async () => {
      const res = await undoMaisonDesignAction();
      if (!res.ok) {
        setPublishError({ message: res.error, code: res.code });
        return;
      }
      onChange({ screen: "detail", status: "Choices saved", phoneSheet: null });
      onBackToDetail();
    });
  }

  function handlePublish() {
    startTransition(async () => {
      setPublishError(null);
      const res = await publishMaxSiteAction();
      if (!res.ok) {
        setPublishError({
          message: res.error,
          code: res.code,
        });
        return;
      }
      onChange({ status: "Live", screen: "gallery", phoneSheet: null });
      setToast(maisonSetupT(locale, "Your website is live"));
      onPublished();
    });
  }

  const readiness = state?.readiness;
  const ready = readiness?.ready === true;
  const headline = readiness
    ? ready
      ? maisonSetupT(locale, "Ready to publish")
      : readiness.blockers.length === 1
        ? maisonSetupT(locale, "1 thing before publishing")
        : maisonReadinessHeadline(readiness)
    : "…";

  const addressLabel = state?.siteSlug
    ? `${state.siteSlug}.tulala.digital`
    : "—";

  const panel = (
    <div className="flex h-full flex-col" data-maison-review-panel="">
      <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
        <div
          data-testid="maison-readiness"
          data-ready={ready ? "true" : "false"}
          className="rounded-xl border border-admin-border-soft p-3"
        >
          <div className="flex items-start gap-2">
            {ready ? (
              <span className="mt-0.5 text-[16px] text-emerald-700" aria-hidden>
                ✓
              </span>
            ) : null}
            <div>
              <p className="text-[14px] font-semibold text-admin-ink">{headline}</p>
              {ready && readiness ? (
                <p className="mt-1 text-[13px] text-admin-ink-muted">{readiness.readyDetail}</p>
              ) : null}
            </div>
          </div>
          {!ready && readiness
            ? readiness.blockers.map((b) => (
                <div
                  key={b.id}
                  data-testid={`maison-blocker-${b.id}`}
                  className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]"
                >
                  <span className="text-admin-ink">{b.message}</span>
                  <a
                    href={b.fixHref}
                    className="font-semibold text-emerald-900 underline-offset-2 hover:underline"
                  >
                    {b.fixLabel}
                  </a>
                </div>
              ))
            : null}
          {readiness?.suggestions.map((s) => (
            <p
              key={s.id}
              data-testid={`maison-suggestion-${s.id}`}
              className="mt-2 text-[12px] text-admin-ink-dim"
            >
              {s.message}
            </p>
          ))}
        </div>

        <div className="space-y-1 text-[13px]">
          <p>
            <span className="font-semibold text-admin-ink">
              {maisonSetupT(locale, "Design")}
            </span>
            <span className="text-admin-ink-muted"> · </span>
            <span data-testid="maison-review-summary">{state?.summaryLine ?? "…"}</span>
          </p>
          {state?.customPalette ? (
            <details
              data-testid="maison-review-design-details"
              className="text-[12px] text-admin-ink-dim"
            >
              <summary className="min-h-11 cursor-pointer font-semibold text-admin-ink-muted">
                {locale === "es" ? "Detalles del diseño" : "Design details"}
              </summary>
              <p className="mt-1">
                {locale === "es"
                  ? "Empezaste desde la demo Nails & Lashes Artist. Nada de su contenido está en tu sitio."
                  : "Started from the Nails & Lashes Artist demo. None of its content is on your site."}
              </p>
            </details>
          ) : null}
          <p>
            <span className="font-semibold text-admin-ink">
              {maisonSetupT(locale, "Address")}
            </span>
            <span className="text-admin-ink-muted"> · </span>
            <span data-testid="maison-review-address">{addressLabel}</span>
          </p>
        </div>

        <p className="text-[12px] text-admin-ink-dim">
          {maisonSetupT(
            locale,
            "Nothing is public until you publish. After publishing you can change the design at any time.",
          )}
        </p>

        {/* W72 — never show trial / plan / price in this flow */}
        <p className="sr-only">{maisonSetupT(locale, "No trial, plan, or price in this flow.")}</p>

        {publishError ? (
          <div
            data-testid="maison-publish-failure"
            data-error-code={publishError.code}
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900"
          >
            <p>{publishError.message}</p>
            <p className="mt-1 text-[11px] text-red-800/80">
              {publishError.code}
            </p>
            <button
              type="button"
              data-testid="maison-publish-retry"
              onClick={handlePublish}
              disabled={pending || !ready}
              className="mt-2 text-[13px] font-semibold text-red-900 underline"
            >
              {maisonSetupT(locale, "Try again")}
            </button>
          </div>
        ) : null}
      </div>

      <div className="sticky bottom-0 border-t border-admin-border-soft bg-white px-4 py-3">
        <button
          type="button"
          data-testid="maison-publish"
          onClick={handlePublish}
          disabled={pending || !ready}
          className="min-h-12 w-full rounded-xl bg-emerald-900 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {pending
            ? maisonSetupT(locale, "Publishing…")
            : maisonSetupT(locale, "Publish")}
        </button>
      </div>
    </div>
  );

  return (
    <section
      data-maison-review=""
      data-testid="maison-review"
      data-talent-profile-id={talentProfileId}
      className="overflow-hidden rounded-2xl border border-admin-border-soft bg-white"
    >
      {toast ? (
        <div
          data-testid="maison-live-toast"
          className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-[13px] font-semibold text-emerald-900"
        >
          {toast}
        </div>
      ) : null}

      <header className="flex items-start justify-between gap-3 border-b border-admin-border-soft px-4 py-3">
        <div>
          <button
            type="button"
            data-testid="maison-review-back"
            onClick={onBackToDetail}
            className="text-[13px] font-semibold text-admin-ink-muted"
          >
            ‹ {maisonSetupT(locale, "THEME")}
          </button>
          <h2 className="mt-1 text-[18px] font-semibold text-admin-ink">
            {maisonSetupT(locale, "Review your website")}
          </h2>
          <p className="mt-0.5 text-[13px] text-admin-ink-muted" data-testid="maison-review-sub">
            {state?.summaryLine ?? "…"}
          </p>
        </div>
        {state?.canUndo ? (
          <button
            type="button"
            data-testid="maison-undo-design"
            onClick={handleUndo}
            disabled={pending}
            className="min-h-10 shrink-0 rounded-xl border border-admin-border-soft px-3 text-[13px] font-semibold text-admin-ink"
          >
            {maisonSetupT(locale, "Undo")}
          </button>
        ) : null}
      </header>

      {loadError ? (
        <p className="px-4 py-6 text-[13px] text-red-800">{loadError}</p>
      ) : (
        <div className="md:grid md:grid-cols-[1fr_360px]">
          <div className="min-h-[420px] border-b border-admin-border-soft p-3 md:border-b-0 md:border-r">
            <ThemeGalleryPreviewFrame
              preview={preview}
              url={previewUrl}
              locale={locale}
              title="Maison review preview"
            />
          </div>
          <aside className="hidden md:block md:min-h-[420px]">{panel}</aside>
          <div className="md:hidden">{panel}</div>
        </div>
      )}
    </section>
  );
}
