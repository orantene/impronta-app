"use client";

/**
 * Talent Quick View — the card's "eye" affordance.
 *
 * A zero-navigation media peek: opens a premium lightbox over the directory
 * with the talent's public gallery, name/type/location strip and two CTAs
 * (View profile → quick-open profile modal; Inquire → lineup toggle). Media
 * loads on demand from /api/directory/preview/[talentId]?media=12 — the grid
 * payload stays lean.
 *
 * Analytics: emits `view_talent_card` (first use of the declared event) with
 * `action: "quick_view"` on every open — dual-written (GA4 + first-party).
 */

import Image from "next/image";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Eye, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { trackProductEvent } from "@/lib/analytics/track-client";
import { cn } from "@/lib/utils";

type QuickViewMedia = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

type QuickViewPayload = {
  displayName: string;
  primaryTalentTypeLabel: string | null;
  locationLabel: string | null;
  heightCm: number | null;
  fitLabels: string[];
  media: QuickViewMedia[];
};

function clampIndex(i: number, len: number) {
  if (len <= 0) return 0;
  return ((i % len) + len) % len;
}

export function TalentQuickViewButton({
  talentProfileId,
  profileCode,
  displayName,
  profileHref,
  thumbnailUrl,
  locale,
  sourcePage,
  className,
  openLabel,
  closeLabel,
  viewProfileLabel,
}: {
  talentProfileId: string;
  profileCode: string;
  displayName: string;
  /** Locale-prefixed /t/<code> href — soft nav = quick-open profile modal. */
  profileHref: string;
  /** Card thumbnail — instant first frame while the gallery loads. */
  thumbnailUrl: string | null;
  locale: string;
  sourcePage: string;
  className?: string;
  openLabel: string;
  closeLabel: string;
  viewProfileLabel: string;
}) {
  const [open, setOpen] = useState(false);

  const handleOpen = (event: React.MouseEvent) => {
    // The card root is a <Link> — keep the peek local.
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.view_talent_card, {
      talent_id: talentProfileId,
      action: "quick_view",
      locale,
      source_page: sourcePage,
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`${openLabel} — ${displayName}`}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background/80 text-foreground/70 backdrop-blur-sm outline-none transition-colors duration-200 hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
        data-card-quick-view=""
      >
        <Eye className="size-3.5" aria-hidden />
      </button>
      {open ? (
        <TalentQuickViewLightbox
          talentProfileId={talentProfileId}
          profileCode={profileCode}
          displayName={displayName}
          profileHref={profileHref}
          thumbnailUrl={thumbnailUrl}
          locale={locale}
          sourcePage={sourcePage}
          closeLabel={closeLabel}
          viewProfileLabel={viewProfileLabel}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function TalentQuickViewLightbox({
  talentProfileId,
  profileCode,
  displayName,
  profileHref,
  thumbnailUrl,
  locale,
  sourcePage,
  closeLabel,
  viewProfileLabel,
  onClose,
}: {
  talentProfileId: string;
  profileCode: string;
  displayName: string;
  profileHref: string;
  thumbnailUrl: string | null;
  locale: string;
  sourcePage: string;
  closeLabel: string;
  viewProfileLabel: string;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<QuickViewPayload | null>(null);
  const [index, setIndex] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/directory/preview/${encodeURIComponent(talentProfileId)}?media=12&locale=${encodeURIComponent(locale)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json) setPayload(json as QuickViewPayload);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [talentProfileId, locale]);

  // Fall back to the card thumbnail until (or in case) the gallery resolves.
  const media: QuickViewMedia[] =
    payload && payload.media.length > 0
      ? payload.media
      : thumbnailUrl
        ? [{ id: "thumb", url: thumbnailUrl, width: null, height: null }]
        : [];
  const count = media.length;
  const active = media[clampIndex(index, count)] ?? null;

  const go = useCallback(
    (delta: number) => {
      if (count <= 1) return;
      setIndex((prev) => clampIndex(prev + delta, count));
    },
    [count],
  );

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  const metaLine = [
    payload?.primaryTalentTypeLabel,
    payload?.locationLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={displayName}
      className="fixed inset-0 z-[130] flex flex-col bg-black/85 backdrop-blur-lg"
      onClick={onClose}
    >
      {/* Header strip */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-medium tracking-wide text-white">
            {displayName}
          </p>
          {metaLine ? (
            <p className="truncate text-[12px] tracking-wide text-white/60">
              {metaLine}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={profileHref}
            onClick={() => onClose()}
            className="inline-flex h-9 items-center rounded-full border border-white/20 bg-white/10 px-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            {viewProfileLabel}
          </Link>
          <TalentCardActions
            talentProfileId={talentProfileId}
            profileCode={profileCode}
            displayName={displayName}
            sourcePage={sourcePage}
            variant="pill"
            hideFavorite
            portraitUrl={thumbnailUrl}
            locale={locale}
          />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="inline-flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Stage */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-14"
        onClick={(e) => e.stopPropagation()}
      >
        {active ? (
          <div className="relative h-full w-full">
            <Image
              key={active.id}
              src={active.url}
              alt={displayName}
              fill
              sizes="100vw"
              className="object-contain"
              priority
            />
          </div>
        ) : (
          <div className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        )}
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/60 sm:left-5"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/40 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/60 sm:right-5"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      {/* Filmstrip */}
      {count > 1 ? (
        <div
          className="flex items-center justify-center gap-2 overflow-x-auto px-4 pb-4"
          onClick={(e) => e.stopPropagation()}
        >
          {media.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`${i + 1}/${count}`}
              className={cn(
                "relative h-14 w-11 shrink-0 overflow-hidden rounded-md border transition-opacity",
                i === clampIndex(index, count)
                  ? "border-white opacity-100"
                  : "border-white/20 opacity-55 hover:opacity-85",
              )}
            >
              <Image
                src={m.url}
                alt=""
                fill
                sizes="44px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
