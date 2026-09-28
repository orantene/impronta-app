"use client";

/**
 * My website card after publish (W40 + P1 mockup): the ONLY thing on the My
 * website tab once the site is live. Left: live preview thumbnail. Right:
 * Live · since, address, Design · palette · content, unpublished state, then
 * View website · Edit site · Change design · Design options, and a Restore
 * previous design link. Works for ANY published design slug.
 * Design options body: DesignOptionsPanel (PR8 / W69).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { loadMaisonDesignOptionsStateAction } from "@/lib/talent-site/server/maison-options-actions";
import { DesignOptionsPanel } from "./DesignOptionsPanel";
import { loadMaisonSetupBootstrapAction } from "./maison-setup-bootstrap";
import { liveCardPaletteName, liveDesignName, lookToPalette } from "./maison-live-summary";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Props = {
  locale: MaisonSetupLocale;
  publicSiteUrl: string | null;
  siteSlug: string | null;
  /** Applied design slug (maison, maison-v2, solace, mono, frame, folio…). */
  themeDesignSlug: string | null;
  themeLookSlug: string | null;
  /** ISO time the site went live. */
  publishedAt: string | null;
  contentModeLabel?: "mine" | "demo";
  onChangeDesign: () => void;
  /** After restore → open Review (W70). */
  onRestoredToReview?: () => void;
};

const PREVIEW_W = 1280;
const PREVIEW_H = 960;
const THUMB_W = 240;
const SCALE = THUMB_W / PREVIEW_W;

function formatSince(iso: string | null, locale: MaisonSetupLocale): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale === "es" ? "es-MX" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MyWebsiteCard({
  locale,
  publicSiteUrl,
  siteSlug,
  themeDesignSlug,
  themeLookSlug,
  publishedAt,
  contentModeLabel = "mine",
  onChangeDesign,
  onRestoredToReview,
}: Props) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [customPalette, setCustomPalette] = useState<MaisonCustomPaletteStored | null>(null);
  /** null = unknown (options state unavailable) → the line is not shown. */
  const [hasPending, setHasPending] = useState<boolean | null>(null);
  const hasNamedPalette = lookToPalette(themeLookSlug) !== null;
  // Same-origin path: the vanity domain refuses to be framed from the app host.
  const thumbSrc = siteSlug ? `/t/site/${encodeURIComponent(siteSlug)}` : publicSiteUrl;

  useEffect(() => {
    if (hasNamedPalette) return;
    let alive = true;
    void loadMaisonSetupBootstrapAction()
      .then((boot) => {
        if (alive && boot.enabled) setCustomPalette(boot.customPalette);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hasNamedPalette, themeLookSlug]);

  useEffect(() => {
    if (optionsOpen) return;
    let alive = true;
    void loadMaisonDesignOptionsStateAction()
      .then((res) => {
        if (alive) setHasPending(res.ok ? res.data.hasLivePending : null);
      })
      .catch(() => {
        if (alive) setHasPending(null);
      });
    return () => {
      alive = false;
    };
  }, [optionsOpen]);

  const t = (key: string) => maisonSetupT(locale, key);
  const paletteName = liveCardPaletteName(locale, themeLookSlug, customPalette);
  const designName = liveDesignName(locale, themeDesignSlug);
  const content = contentModeLabel === "mine" ? t("Your content") : t("Demo content");
  const summary = `${t("Design:")} ${designName} · ${paletteName} · ${content}`;
  const address = siteSlug ? `${siteSlug}.tulala.digital` : publicSiteUrl ?? "";
  const since = formatSince(publishedAt, locale);
  const secondaryBtn =
    "inline-flex min-h-11 items-center rounded-xl border border-admin-border-soft bg-white px-4 text-[13px] font-semibold text-admin-ink";

  const closeOptions = () => {
    setOptionsOpen(false);
    setRestoreOpen(false);
  };

  return (
    <section
      data-testid="maison-my-website-card"
      data-maison-my-website=""
      data-design-slug={themeDesignSlug ?? undefined}
      className="overflow-hidden rounded-2xl border border-admin-border-soft bg-white font-admin-body"
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        <div
          aria-hidden
          data-testid="maison-live-thumb"
          className="relative shrink-0 overflow-hidden rounded-xl border border-admin-border-soft bg-white"
          style={{ width: THUMB_W, height: PREVIEW_H * SCALE, maxWidth: "100%" }}
        >
          {thumbSrc ? (
            <iframe
              src={thumbSrc}
              title={t("Website preview")}
              tabIndex={-1}
              className="pointer-events-none absolute left-0 top-0 border-0"
              style={{
                width: PREVIEW_W,
                height: PREVIEW_H,
                transform: `scale(${SCALE})`,
                transformOrigin: "0 0",
              }}
            />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-admin-ink">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" aria-hidden />
            <span data-testid="maison-live-pill">
              {t("Live")}
              {since ? ` · ${t("since")} ${since}` : ""}
            </span>
          </p>
          <p
            data-testid="maison-live-address"
            className="mt-1 truncate text-[17px] font-bold text-admin-ink"
          >
            {address}
          </p>
          <p data-testid="maison-live-summary" className="mt-0.5 text-[13px] text-admin-ink-muted">
            {summary}
          </p>
          {hasPending != null ? (
            <p data-testid="maison-live-pending" className="mt-0.5 text-[13px] text-admin-ink-muted">
              {hasPending ? t("Unpublished changes") : t("No unpublished changes")}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {publicSiteUrl ? (
              <Link
                href={publicSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="maison-view-website"
                className={secondaryBtn}
              >
                {t("View website")} ↗
              </Link>
            ) : null}
            <Link href="/talent/page-builder" data-testid="maison-edit-site" className={secondaryBtn}>
              {t("Edit site")}
            </Link>
            <button
              type="button"
              data-testid="maison-change-design"
              onClick={onChangeDesign}
              className="inline-flex min-h-11 items-center rounded-xl bg-admin-ink px-4 text-[13px] font-semibold text-white"
            >
              {t("Change design")}
            </button>
            <button
              type="button"
              data-testid="maison-design-options"
              onClick={() => setOptionsOpen(true)}
              className={secondaryBtn}
            >
              {t("Design options")}
            </button>
          </div>
          <button
            type="button"
            data-testid="maison-restore-previous"
            onClick={() => {
              setRestoreOpen(true);
              setOptionsOpen(true);
            }}
            className="mt-2 min-h-11 text-[13px] font-semibold text-admin-ink-muted underline underline-offset-2 hover:text-admin-ink"
          >
            {t("Restore previous design")}
          </button>
        </div>
      </div>
      <DesignOptionsPanel
        locale={locale}
        open={optionsOpen}
        startWithRestore={restoreOpen}
        onClose={closeOptions}
        onRestoredToReview={() => {
          closeOptions();
          onRestoredToReview?.();
        }}
      />
    </section>
  );
}
