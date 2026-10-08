"use client";

/**
 * Wave 3 Mi sitio web hero: large live preview, status + domain chip,
 * one primary Edit site, labeled secondary actions, presence tiles below.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Blocks,
  CircleHelp,
  Droplets,
  History,
  Link2,
  Monitor,
  Settings,
  Smartphone,
  SwatchBook,
} from "lucide-react";
import { useAdminShellOptional } from "@/components/admin/shell/internal/state/context";
import type { MaisonCustomPaletteStored } from "@/lib/talent-site/theme-catalog/maison/maison-custom-palette";
import { loadTalentGoLiveAction } from "@/lib/talent-site/history/history-actions";
import { goLiveHasPending } from "./go-live-pending";
import { takeOr } from "../public-page-bootstrap";
import { DesignOptionsPanel } from "./DesignOptionsPanel";
import { loadMaisonSetupBootstrapAction } from "./maison-setup-bootstrap";
import { legacyPaletteLabel, liveCardDesignLabel } from "./maison-live-summary";
import { lookSlugToGalleryPaletteKey, paletteDisplayName } from "./live-design-change";
import { SitePublishEntry } from "./SitePublishEntry";
import { sitePublishEntryState } from "./site-publish-entry";
import { maisonSetupT, type MaisonSetupLocale } from "./maison-setup-copy";

type Props = {
  locale: MaisonSetupLocale;
  publicSiteUrl: string | null;
  siteSlug: string | null;
  themeDesignSlug: string | null;
  themeLookSlug: string | null;
  legacyProfileTemplate?: string | null;
  publishedAt: string | null;
  contentModeLabel?: "mine" | "demo";
  onChangeDesign: () => void;
  /** Opens the Review (publish) step. */
  onOpenReview?: () => void;
  onRestoredToReview?: () => void;
  liveToast?: string | null;
  onLiveToastDone?: () => void;
  /** Wave 3 tiles */
  onOpenDomain?: () => void;
  onOpenQuestions?: () => void;
  onOpenSettings?: () => void;
  onOpenApps?: () => void;
  showTiles?: boolean;
};

/** Real iframe viewports so phone CSS breakpoints fire (not a shrunk desktop). */
const PREVIEW_VIEWPORT = {
  desktop: { w: 1280, h: 960 },
  phone: { w: 390, h: 844 },
} as const;
const PREVIEW_MAX_W = { desktop: 560, phone: 280 } as const;

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

function IconBtn({
  label,
  tip,
  onClick,
  testId,
  icon: Icon,
}: {
  label: string;
  tip: string;
  onClick: () => void;
  testId: string;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      title={tip}
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-admin-border-soft bg-white px-3 text-[13px] font-semibold text-admin-ink hover:bg-admin-surface-alt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tc-action,#3B8277)]"
    >
      <span
        className="grid size-8 place-items-center rounded-lg bg-[var(--tc-soft,#E8F3F1)] text-[var(--tc-action-ink,#245850)]"
        aria-hidden
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span>{label}</span>
    </button>
  );
}

function TileIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      className="grid size-9 place-items-center rounded-lg bg-[var(--tc-soft,#E8F3F1)] text-[var(--tc-action-ink,#245850)]"
      aria-hidden
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  );
}

/** Domain / Questions / Settings / Apps — live card + pre-publish setup. */
export function PresenceSiteTiles({
  locale,
  onOpenDomain,
  onOpenQuestions,
  onOpenSettings,
  onOpenApps,
  topRule = false,
}: {
  locale: MaisonSetupLocale;
  onOpenDomain?: () => void;
  onOpenQuestions?: () => void;
  onOpenSettings?: () => void;
  onOpenApps?: () => void;
  /** When true, draw a top rule (live card sits above the tiles). */
  topRule?: boolean;
}) {
  const t = (key: string) => maisonSetupT(locale, key);
  const tiles: Array<{
    id: string;
    label: string;
    icon: LucideIcon;
    onClick?: () => void;
    testId: string;
  }> = [
    { id: "domain", label: t("Domain"), icon: Link2, onClick: onOpenDomain, testId: "presence-tile-domain" },
    { id: "questions", label: t("Questions"), icon: CircleHelp, onClick: onOpenQuestions, testId: "presence-tile-questions" },
    { id: "settings", label: t("Settings"), icon: Settings, onClick: onOpenSettings, testId: "presence-tile-settings" },
    { id: "apps", label: t("Apps"), icon: Blocks, onClick: onOpenApps, testId: "presence-tile-apps" },
  ];
  return (
    <div
      data-testid="presence-site-tiles"
      className={`grid grid-cols-2 gap-2 p-4 sm:grid-cols-4${topRule ? " border-t border-admin-border-soft" : ""}`}
    >
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          data-testid={tile.testId}
          disabled={!tile.onClick}
          onClick={tile.onClick}
          className="flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border border-admin-border-soft bg-admin-canvas px-2 text-center disabled:opacity-40"
        >
          <TileIcon icon={tile.icon} />
          <span className="text-[12.5px] font-semibold text-admin-ink">{tile.label}</span>
        </button>
      ))}
    </div>
  );
}

export function MyWebsiteCard({
  locale,
  publicSiteUrl,
  siteSlug,
  themeDesignSlug,
  themeLookSlug,
  legacyProfileTemplate = null,
  publishedAt,
  contentModeLabel = "mine",
  onChangeDesign,
  onOpenReview,
  onRestoredToReview,
  liveToast = null,
  onLiveToastDone,
  onOpenDomain,
  onOpenQuestions,
  onOpenSettings,
  onOpenApps,
  showTiles = true,
}: Props) {
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [customPalette, setCustomPalette] = useState<MaisonCustomPaletteStored | null>(null);
  const [hasPending, setHasPending] = useState<boolean | null>(null);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [copied, setCopied] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const hasNamedPalette =
    lookSlugToGalleryPaletteKey(themeDesignSlug, themeLookSlug) !== null;
  const talentId = useAdminShellOptional()?.bridgeTalentSelfProfile?.id ?? null;
  const thumbSrc = talentId
    ? `/template-preview/current?kind=live-site&talent=${encodeURIComponent(talentId)}&locale=${locale}`
    : null;

  useEffect(() => {
    if (hasNamedPalette) return;
    let alive = true;
    void takeOr("maison", "card", loadMaisonSetupBootstrapAction)
      .then((boot) => {
        if (alive && boot.enabled) setCustomPalette(boot.customPalette);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [hasNamedPalette, themeLookSlug, themeDesignSlug]);

  useEffect(() => {
    if (optionsOpen) return;
    let alive = true;
    void takeOr("goLive", "card", loadTalentGoLiveAction)
      .then((res) => {
        if (alive) setHasPending(res.ok ? goLiveHasPending(res.summary) : null);
      })
      .catch(() => {
        if (alive) setHasPending(null);
      });
    return () => {
      alive = false;
    };
  }, [optionsOpen]);

  useEffect(() => {
    if (!liveToast) return;
    const timer = window.setTimeout(() => onLiveToastDone?.(), 6000);
    return () => window.clearTimeout(timer);
  }, [liveToast, onLiveToastDone]);

  const t = (key: string) => maisonSetupT(locale, key);
  const hasDesignSlug = Boolean(themeDesignSlug?.trim());
  const paletteName = hasDesignSlug
    ? paletteDisplayName({
        locale,
        designSlug: themeDesignSlug,
        lookSlug: themeLookSlug,
        customPalette,
      })
    : legacyPaletteLabel(locale, customPalette);
  const designName = liveCardDesignLabel({
    locale,
    designSlug: themeDesignSlug,
    legacyProfileTemplate,
  });
  const content = contentModeLabel === "mine" ? t("Your content") : t("Demo content");
  const summary = [`${t("Design:")} ${designName}`, paletteName, content]
    .filter(Boolean)
    .join(" · ");
  // Prefer the server-built public URL (demo hosts use `{slug}-demo.tulala.digital`).
  const address = (() => {
    if (publicSiteUrl) {
      try {
        return new URL(publicSiteUrl).host;
      } catch {
        return publicSiteUrl.replace(/^https?:\/\//, "").split("/")[0] ?? "";
      }
    }
    return siteSlug ? `${siteSlug}.tulala.digital` : "";
  })();
  const since = formatSince(publishedAt, locale);

  const closeOptions = () => {
    setOptionsOpen(false);
    setRestoreOpen(false);
  };

  const copyAddress = async () => {
    if (!address || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const viewport = PREVIEW_VIEWPORT[device];
  const previewMaxW = PREVIEW_MAX_W[device];
  const scale = previewMaxW / viewport.w;

  return (
    <section
      data-testid="maison-my-website-card"
      data-maison-my-website=""
      data-gallery-wave3-hero=""
      data-design-slug={themeDesignSlug ?? undefined}
      className="overflow-hidden rounded-2xl border border-admin-border-soft bg-white font-admin-body"
    >
      {liveToast ? (
        <div
          role="status"
          data-testid="maison-design-live-toast"
          className="border-b border-admin-border-soft bg-admin-surface-alt px-4 py-2 text-[13px] font-semibold text-admin-ink"
        >
          {liveToast}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[13px] font-semibold text-admin-ink">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-600" aria-hidden />
              <span data-testid="maison-live-pill">
                {t("Live")}
                {since ? ` · ${t("since")} ${since}` : ""}
              </span>
            </p>
            <div className="flex rounded-lg border border-admin-border-soft p-0.5">
              {(["desktop", "phone"] as const).map((d) => {
                const DeviceIcon = d === "desktop" ? Monitor : Smartphone;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={device === d}
                    aria-label={t(d === "desktop" ? "Desktop" : "Phone")}
                    onClick={() => setDevice(d)}
                    className={`grid h-9 w-9 place-items-center rounded-md ${
                      device === d
                        ? "bg-[var(--tc-soft,#E8F3F1)] text-[var(--tc-action-ink,#245850)] ring-1 ring-[var(--tc-action,#3B8277)]"
                        : "text-admin-ink-muted"
                    }`}
                  >
                    <DeviceIcon className="size-4" strokeWidth={1.75} aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>

          <div
            data-testid="maison-live-thumb"
            data-preview-device={device}
            className="relative mx-auto overflow-hidden rounded-xl border border-admin-border-soft bg-admin-canvas"
            style={{
              width: "100%",
              maxWidth: previewMaxW,
              height: viewport.h * scale,
            }}
          >
            {/* Never a bare white box: the site's address sits under the frame
                until it has painted (or when there is no preview to load). */}
            {!thumbLoaded ? (
              <div
                data-testid="maison-live-thumb-placeholder"
                aria-hidden
                className="absolute inset-0 flex animate-pulse flex-col items-center justify-center gap-1.5 px-4 text-center"
              >
                <span className="text-[14px] font-semibold text-admin-ink">{address}</span>
                <span className="text-[12px] text-admin-ink-muted">{t("Website preview")}</span>
              </div>
            ) : null}
            {thumbSrc ? (
              <iframe
                src={thumbSrc}
                title={t("Website preview")}
                onLoad={() => setThumbLoaded(true)}
                className="absolute left-0 top-0 border-0"
                style={{
                  width: viewport.w,
                  height: viewport.h,
                  transform: `scale(${scale})`,
                  transformOrigin: "0 0",
                }}
              />
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 lg:max-w-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="maison-live-address"
              className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-admin-border-soft bg-admin-surface-alt px-3 py-1.5 text-[13px] font-semibold text-admin-ink"
            >
              {address}
            </span>
            <button
              type="button"
              aria-label={t("Copy address")}
              title={copied ? "✓" : t("Copy address")}
              onClick={() => void copyAddress()}
              className="grid h-11 w-11 place-items-center rounded-xl border border-admin-border-soft text-[14px]"
            >
              {copied ? "✓" : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                </svg>
              )}
            </button>
            {publicSiteUrl ? (
              <Link
                href={publicSiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="maison-view-website"
                aria-label={t("Open site")}
                title={t("Open site")}
                className="grid h-11 w-11 place-items-center rounded-xl border border-admin-border-soft text-[14px] text-admin-ink"
              >
                ↗
              </Link>
            ) : null}
          </div>

          <p data-testid="maison-live-summary" className="text-[13px] text-admin-ink-muted">
            {summary}
          </p>
          {hasPending != null ? (
            <p data-testid="maison-live-pending" className="text-[13px] text-admin-ink-muted">
              {hasPending ? t("Unpublished changes") : t("No unpublished changes")}
            </p>
          ) : null}

          <Link
            href="/talent/page-builder"
            data-testid="maison-edit-site"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--tulala-primary-fill,#3B8277)] bg-[var(--tulala-primary-fill,#3B8277)] px-5 text-[14px] font-semibold text-white hover:border-[var(--tulala-primary-fill-deep,#326F66)] hover:bg-[var(--tulala-primary-fill-deep,#326F66)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tulala-primary-fill,#3B8277)]"
          >
            {t("Edit site")}
          </Link>

          {onOpenReview ? (
            <SitePublishEntry
              locale={locale}
              state={sitePublishEntryState({ published: true, publishable: true, hasPending })}
              publicSiteUrl={publicSiteUrl}
              onOpenReview={onOpenReview}
            />
          ) : null}

          <div className="flex flex-wrap gap-2" data-testid="maison-site-secondary-actions">
            <IconBtn
              label={t("Change design")}
              tip={t("Change design")}
              testId="maison-change-design"
              icon={SwatchBook}
              onClick={onChangeDesign}
            />
            <IconBtn
              label={t("Colors")}
              tip={t("Colors")}
              testId="maison-design-options"
              icon={Droplets}
              onClick={() => setOptionsOpen(true)}
            />
            <IconBtn
              label={t("History")}
              tip={t("Restore previous design")}
              testId="maison-restore-previous"
              icon={History}
              onClick={() => {
                setRestoreOpen(true);
                setOptionsOpen(true);
              }}
            />
          </div>
        </div>
      </div>

      {showTiles ? (
        <PresenceSiteTiles
          locale={locale}
          topRule
          onOpenDomain={onOpenDomain}
          onOpenQuestions={onOpenQuestions}
          onOpenSettings={onOpenSettings}
          onOpenApps={onOpenApps}
        />
      ) : null}

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
