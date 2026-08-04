"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { TalentCardActions } from "@/components/talent-cards/talent-card-actions";
import { AIMatchExplanation } from "@/components/ai/ai-match-explanation";
import { TalentCardAiMatchDrawer } from "@/components/directory/talent-card-ai-match-drawer";
import { StaticStars } from "@/components/reviews/star-rating";
import {
  computeStandingTier,
  meetsCredibilityFloor,
  standingTierLabel,
  wouldBookAgainPhrase,
} from "@/lib/reviews/craft-standing";
import type { DirectoryAiCardOverlay, DirectoryCardDTO } from "@/lib/directory/types";
import { cn } from "@/lib/utils";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import {
  type CaptionNorms,
  isRedundant,
  NO_CAPTION_NORMS,
} from "@/lib/directory/caption-norms";
import { TalentQuickViewButton } from "@/components/directory/talent-quick-view";
import { formatPriceFromLabel } from "@/lib/directory/format-price-from";

function talentProfileHref(pathname: string, profileCode: string): string {
  return clientLocaleHref(pathname, `/t/${encodeURIComponent(profileCode)}`);
}

export function TalentDirectoryListRow({
  card,
  onQuickPreview,
  priority,
  sourcePage = "/directory",
  ui,
  aiOverlay = null,
  locale = "en",
  showQuickView = true,
  showPriceFrom = false,
  showSave = true,
  showAddToInquiry = true,
  cardClickAction = "modal",
  captionNorms = NO_CAPTION_NORMS,
}: {
  card: DirectoryCardDTO;
  /** Legacy hook; when absent the row renders the shared quick-view lightbox. */
  onQuickPreview?: () => void;
  priority?: boolean;
  sourcePage?: string;
  ui: DirectoryUiCopy;
  aiOverlay?: DirectoryAiCardOverlay | null;
  locale?: string;
  /** Parity with the grid — same section knobs, same behavior. */
  showQuickView?: boolean;
  showPriceFrom?: boolean;
  showSave?: boolean;
  showAddToInquiry?: boolean;
  cardClickAction?: "modal" | "page";
  captionNorms?: CaptionNorms;
}) {
  const pathname = usePathname();
  const lc = ui.list;
  const c = ui.card;
  const brand = ui.common.brand;
  const profileHref = talentProfileHref(pathname, card.profileCode);
  // Thumbnail rect = start point for the card→pill fly animation on cart-add.
  const mediaRef = useRef<HTMLAnchorElement>(null);
  const getInquiryPhotoRect = useCallback(
    () => mediaRef.current?.getBoundingClientRect() ?? null,
    [],
  );

  const priceFromLabel =
    typeof card.priceFromCents === "number" && card.priceFromCents > 0
      ? formatPriceFromLabel(
          card.priceFromCents,
          card.priceFromCurrency ?? "USD",
          locale,
        )
      : null;

  // cardClickAction="page" — defeat the @modal interception exactly like the
  // grid adapter does, preserving every native new-tab / save-link gesture.
  const handleClickCapture =
    cardClickAction === "page" && profileHref
      ? (event: React.MouseEvent) => {
          if (!(event.target as HTMLElement).closest?.("a[href]")) return;
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          window.location.assign(profileHref);
        }
      : undefined;
  return (
    <article
      onClickCapture={handleClickCapture}
      className={cn(
        "flex gap-4 rounded-2xl border border-border bg-card/90 p-3 shadow-sm transition-[box-shadow] hover:shadow-md hover:shadow-[var(--impronta-gold)]/10",
      )}
    >
      <Link
        ref={mediaRef}
        href={profileHref}
        aria-hidden
        tabIndex={-1}
        className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-muted"
      >
        {card.thumbnail.url ? (
          <Image
            src={card.thumbnail.url}
            alt=""
            fill
            className="object-cover"
            sizes="80px"
            priority={priority}
          />
        ) : (
          <div className="flex h-full items-center justify-center font-[family-name:var(--font-cinzel)] text-[10px] tracking-widest text-[var(--impronta-muted)]">
            {brand}
          </div>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 py-0.5">
        <div className="min-w-0">
          <h2 className="truncate font-[family-name:var(--font-cinzel)] text-base font-semibold tracking-wide text-[var(--impronta-foreground)]">
            <Link href={profileHref} className="hover:text-[var(--impronta-gold)]">
              {card.displayName}
            </Link>
          </h2>
          <p className="truncate text-sm text-[var(--impronta-muted)]">
            {card.primaryTalentTypeLabel}
            {/* Differential caption — parity with the grid: the city only
                earns a line when it differs from the rest of the results. */}
            {card.locationLabel &&
            !isRedundant(card.locationLabel, captionNorms.dominantLocation) ? (
              <>
                <span className="mx-1.5 text-[var(--impronta-gold-dim)]">·</span>
                {card.locationLabel}
              </>
            ) : null}
          </p>
          {showPriceFrom && priceFromLabel ? (
            <p
              data-card-price-from
              className="mt-0.5 text-[12px] font-medium tracking-wide text-[var(--impronta-gold)]"
            >
              {priceFromLabel}
            </p>
          ) : null}
          {aiOverlay &&
          (aiOverlay.explanationLines.length > 0 ||
            aiOverlay.confidenceNote ||
            (aiOverlay.vectorSimilarity != null &&
              Number.isFinite(aiOverlay.vectorSimilarity))) ? (
            <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--impronta-muted)]">
                  {c.matchWhyPrefix}
                </p>
                <TalentCardAiMatchDrawer
                  displayName={card.displayName}
                  overlay={aiOverlay}
                  copy={{
                    openDetailsAria: c.aiDetailsOpenAria,
                    drawerTitle: c.aiDetailsDrawerTitle,
                    drawerDescription: c.aiDetailsDrawerDescription,
                    vectorScoreLabel: c.aiDetailsVectorScore,
                    matchWhyAria: c.aiMatchWhyAria,
                  }}
                />
              </div>
              {aiOverlay.explanationLines.length > 0 ? (
                <AIMatchExplanation
                  items={aiOverlay.explanationLines}
                  className="text-[11px] text-[var(--impronta-muted)] [&_span]:text-[var(--impronta-foreground)]/90"
                  ariaLabel={c.aiMatchWhyAria}
                />
              ) : null}
              {aiOverlay.confidenceNote ? (
                <p className="mt-1 text-[9px] leading-snug text-[var(--impronta-muted)]">
                  {aiOverlay.confidenceNote}
                </p>
              ) : null}
            </div>
          ) : null}
          {/* Craft standing — rendered only past the credibility floor. Below
              the floor we render NOTHING (absence is neutral: no "New"/"0.0"
              placeholder). CSS tokens gate visibility; the markup + data hooks
              are always emitted so the token layer can show/hide it. Cool
              tokens to match the card, not gold-on-light. */}
          {card.ratingAvg != null && meetsCredibilityFloor(card.ratingCount) ? (
            (() => {
              const ratingCount = card.ratingCount ?? 0;
              const tier = computeStandingTier({
                ratingCount,
                ratingAvg: card.ratingAvg,
                wouldBookAgainPct: card.wouldBookAgainPct ?? null,
              });
              const bookAgain = wouldBookAgainPhrase(
                ratingCount,
                card.wouldBookAgainPct ?? null,
              );
              return (
                <div
                  data-card-standing
                  className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1"
                >
                  <span
                    data-card-standing-tier
                    className="inline-flex items-center rounded-full border border-white/[0.1] bg-white/[0.05] px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--impronta-foreground)]/90"
                  >
                    {standingTierLabel(tier)}
                  </span>
                  <span
                    data-card-standing-signal
                    className="inline-flex items-center gap-1.5 text-[11px] text-[var(--impronta-muted)]"
                  >
                    <StaticStars rating={card.ratingAvg} size={12} />
                    <span className="text-[var(--impronta-foreground)]/90 tabular-nums">
                      {card.ratingAvg.toFixed(1)}
                    </span>
                    <span aria-hidden className="text-[var(--impronta-gold-dim)]">
                      ·
                    </span>
                    <span className="tabular-nums">{ratingCount}</span>
                    {bookAgain ? (
                      <>
                        <span
                          aria-hidden
                          className="text-[var(--impronta-gold-dim)]"
                        >
                          ·
                        </span>
                        <span>{bookAgain}</span>
                      </>
                    ) : null}
                  </span>
                </div>
              );
            })()
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Favorite + inquiry — canonical TalentCardActions. Carries the
              portrait + photo rect for the card→pill fly animation on add.
              Honors the same section/tenant toggles as the grid cards. */}
          {showSave || showAddToInquiry ? (
            <TalentCardActions
              talentProfileId={card.id}
              profileCode={card.profileCode}
              displayName={card.displayName}
              sourcePage={sourcePage}
              variant="compact"
              portraitUrl={card.thumbnail.url ?? null}
              getInquiryPhotoRect={getInquiryPhotoRect}
              hideFavorite={!showSave}
              hideInquiry={!showAddToInquiry}
            />
          ) : null}
          <Button
            asChild
            size="sm"
            className="h-8 rounded-lg bg-[var(--impronta-gold)] px-3 text-[10px] font-semibold uppercase tracking-wider text-black hover:bg-[var(--impronta-gold-bright)]"
          >
            <Link href={profileHref}>{lc.view}</Link>
          </Button>
          {/* Quick view. `onQuickPreview` was never passed by any caller, so
              this button was dead code and lc.preview unreachable; the row now
              mounts the SAME lightbox the grid cards use. */}
          {onQuickPreview ? (
            <button
              type="button"
              className="text-[10px] font-medium uppercase tracking-wide text-[var(--impronta-muted)] underline-offset-4 hover:text-[var(--impronta-gold)] hover:underline"
              onClick={onQuickPreview}
            >
              {lc.preview}
            </button>
          ) : showQuickView && card.profileCode ? (
            <TalentQuickViewButton
              talentProfileId={card.id}
              profileCode={card.profileCode}
              displayName={card.displayName}
              profileHref={profileHref}
              thumbnailUrl={card.thumbnail.url ?? null}
              locale={locale}
              sourcePage={sourcePage}
              openLabel={locale === "es" ? "Vista rápida" : "Quick view"}
              closeLabel={locale === "es" ? "Cerrar" : "Close"}
              viewProfileLabel={locale === "es" ? "Ver perfil" : "View profile"}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}
