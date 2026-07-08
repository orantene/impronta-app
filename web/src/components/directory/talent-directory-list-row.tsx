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
}: {
  card: DirectoryCardDTO;
  /** Optional quick-preview handler; the preview button is hidden when absent. */
  onQuickPreview?: () => void;
  priority?: boolean;
  sourcePage?: string;
  ui: DirectoryUiCopy;
  aiOverlay?: DirectoryAiCardOverlay | null;
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
  return (
    <article
      className={cn(
        "flex gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-r from-zinc-900/90 to-black/90 p-3 shadow-sm transition-[box-shadow] hover:shadow-md hover:shadow-[var(--impronta-gold)]/10",
      )}
    >
      <Link
        ref={mediaRef}
        href={profileHref}
        aria-hidden
        tabIndex={-1}
        className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-800"
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
            {card.locationLabel ? (
              <>
                <span className="mx-1.5 text-[var(--impronta-gold-dim)]">·</span>
                {card.locationLabel}
              </>
            ) : null}
          </p>
          {aiOverlay &&
          (aiOverlay.explanationLines.length > 0 ||
            aiOverlay.confidenceNote ||
            (aiOverlay.vectorSimilarity != null &&
              Number.isFinite(aiOverlay.vectorSimilarity))) ? (
            <div className="mt-2 rounded-md border border-white/[0.06] bg-black/25 px-2 py-1.5">
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
              portrait + photo rect for the card→pill fly animation on add. */}
          <TalentCardActions
            talentProfileId={card.id}
            profileCode={card.profileCode}
            displayName={card.displayName}
            sourcePage={sourcePage}
            variant="compact"
            portraitUrl={card.thumbnail.url ?? null}
            getInquiryPhotoRect={getInquiryPhotoRect}
          />
          <Button
            asChild
            size="sm"
            className="h-8 rounded-lg bg-[var(--impronta-gold)] px-3 text-[10px] font-semibold uppercase tracking-wider text-black hover:bg-[var(--impronta-gold-bright)]"
          >
            <Link href={profileHref}>{lc.view}</Link>
          </Button>
          {onQuickPreview ? (
            <button
              type="button"
              className="text-[10px] font-medium uppercase tracking-wide text-[var(--impronta-muted)] underline-offset-4 hover:text-[var(--impronta-gold)] hover:underline"
              onClick={onQuickPreview}
            >
              {lc.preview}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
