"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Bookmark, ChevronDown, ChevronUp, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContactTalentButton } from "@/components/directory/directory-inquiry-actions";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import { AIMatchExplanation } from "@/components/ai/ai-match-explanation";
import { TalentCardAiMatchDrawer } from "@/components/directory/talent-card-ai-match-drawer";
import type {
  DirectoryAiCardOverlay,
  DirectoryCardAttributeDTO,
  DirectoryCardDTO,
} from "@/lib/directory/types";
import { MAX_CARD_FIT_LABELS } from "@/lib/directory/talent-card-dto";
import { cn } from "@/lib/utils";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import {
  formatCardImageAlt,
  formatSrOnlyProfileCode,
} from "@/lib/directory/directory-ui-copy";
import { clientLocaleHref } from "@/i18n/client-directory-href";
import { PRODUCT_ANALYTICS_EVENTS } from "@/lib/analytics/product-events";
import { trackProductEvent } from "@/lib/analytics/track-client";

function talentProfileHref(pathname: string, profileCode: string): string {
  return clientLocaleHref(pathname, `/t/${encodeURIComponent(profileCode)}`);
}

function partitionCardAttributes(attrs: readonly DirectoryCardAttributeDTO[]) {
  const availability = attrs.find((a) => a.key === "availability_status");
  const industries = attrs.find((a) => a.key === "industries");
  const gridAttrs = attrs.filter(
    (a) => a.key !== "availability_status" && a.key !== "industries",
  );
  return { availability, industries, gridAttrs };
}

/** Top-left availability chip when the card shows a non-unavailable status. */
function availabilityChipText(
  attr: DirectoryCardAttributeDTO | undefined,
  availableLabel: string,
): string | null {
  if (!attr?.value?.trim()) return null;
  const v = attr.value.toLowerCase();
  if (
    v.includes("unavailable") ||
    v.includes("no disponible") ||
    v.includes("indisponible") ||
    v.includes("not available")
  ) {
    return null;
  }
  return availableLabel;
}

export type TalentCardProps = {
  card: DirectoryCardDTO;
  saved: boolean;
  onSaveToggle: () => void;
  onQuickPreview: () => void;
  /** First viewport row — improves LCP */
  priority?: boolean;
  className?: string;
  /** Passed through to inquiry actions (search context). */
  sourcePage?: string;
  ui: DirectoryUiCopy;
  /** When present (hybrid AI listing), show compact match explanations + optional confidence line. */
  aiOverlay?: DirectoryAiCardOverlay | null;
};

/**
 * Directory card — streamlined layout: full-bleed portrait hero with name/type overlay,
 * compact attribute reveal, and a clean action row.
 */
export function TalentCard({
  card,
  saved,
  onSaveToggle,
  onQuickPreview,
  priority,
  className,
  sourcePage = "/directory",
  ui,
  aiOverlay = null,
}: TalentCardProps) {
  const pathname = usePathname();
  const { setFlash } = usePublicDiscoveryState();
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    trackProductEvent(PRODUCT_ANALYTICS_EVENTS.view_talent_card, {
      talent_id: card.id,
      source_page: sourcePage,
    });
  }, [card.id, sourcePage]);
  const c = ui.card;
  const brand = ui.common.brand;
  const profileHref = talentProfileHref(pathname, card.profileCode);
  const fitLabels = card.fitLabels.slice(0, MAX_CARD_FIT_LABELS);
  const aspectStyle =
    card.thumbnail.width && card.thumbnail.height
      ? { aspectRatio: `${card.thumbnail.width} / ${card.thumbnail.height}` }
      : { aspectRatio: "3 / 4" };

  const cardAttributes = card.cardAttributes ?? [];
  const { availability, industries, gridAttrs } = partitionCardAttributes(cardAttributes);
  const availableLabel = availabilityChipText(availability, c.available);
  const hasDetails = gridAttrs.length > 0 || !!industries?.value;

  const shareProfile = useCallback(async () => {
    const path = talentProfileHref(pathname, card.profileCode);
    const url =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: card.displayName,
          text: `${card.displayName} — Impronta`,
          url,
        });
        trackProductEvent(PRODUCT_ANALYTICS_EVENTS.share_profile, {
          talent_id: card.id,
          source_page: sourcePage,
        });
        return;
      } catch {
        /* user dismissed share sheet */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      trackProductEvent(PRODUCT_ANALYTICS_EVENTS.share_profile, {
        talent_id: card.id,
        source_page: sourcePage,
      });
      setFlash({
        tone: "success",
        title: c.linkCopiedTitle,
        message: c.linkCopiedMessage,
      });
    } catch {
      setFlash({
        tone: "error",
        title: c.linkCopyFailedTitle,
        message: c.linkCopyFailedMessage,
      });
    }
  }, [card, setFlash, c, pathname, sourcePage]);

  return (
    <div
      className={cn(
        "group/card flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-zinc-900/95 to-black shadow-sm transition-shadow duration-200 hover:shadow-lg hover:shadow-[var(--impronta-gold)]/8",
        className,
      )}
    >
      {/* ── Hero image with overlays ── */}
      <Link href={profileHref} className="relative block w-full overflow-hidden" style={aspectStyle}>
        {card.thumbnail.url ? (
          <Image
            src={card.thumbnail.url}
            alt={formatCardImageAlt(c, card.displayName)}
            fill
            className="object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
          />
        ) : (
          <div
            className="flex h-full min-h-[200px] items-center justify-center bg-gradient-to-b from-zinc-800/90 to-zinc-950 font-[family-name:var(--font-cinzel)] text-sm tracking-[0.2em] text-[var(--impronta-muted)]"
            aria-hidden
          >
            {brand}
          </div>
        )}

        {/* Gradient overlay — always present for text readability */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
          aria-hidden
        />

        {/* Top-left: availability + featured badges */}
        <div className="absolute left-2 top-2 z-[1] flex flex-wrap items-center gap-1.5">
          {card.isFeatured ? (
            <span className="pointer-events-none rounded-full border border-[var(--impronta-gold)]/30 bg-black/50 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-[var(--impronta-gold)] backdrop-blur-sm sm:text-[9px]">
              {c.featuredLabel}
            </span>
          ) : null}
          {availableLabel ? (
            <span className="pointer-events-none rounded-full border border-white/20 bg-black/40 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--impronta-foreground)]/90 backdrop-blur-sm sm:text-[9px]">
              {availableLabel}
            </span>
          ) : null}
        </div>

        {/* Top-right: save + share */}
        <div className="absolute right-1.5 top-1.5 z-[1] flex flex-col gap-1">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="size-8 rounded-full border border-white/10 bg-black/50 text-[var(--impronta-gold)] backdrop-blur-sm hover:bg-black/70"
            aria-pressed={saved}
            aria-label={saved ? c.removeSaveAria : c.saveAria}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSaveToggle();
            }}
          >
            <Bookmark
              className={cn("size-3.5", saved && "fill-current")}
              strokeWidth={1.75}
            />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="size-8 rounded-full border border-white/10 bg-black/50 text-[var(--impronta-foreground)] backdrop-blur-sm hover:bg-black/70"
            aria-label={c.shareAria}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void shareProfile();
            }}
          >
            <Share2 className="size-3.5" strokeWidth={1.75} />
          </Button>
        </div>

        {/* Bottom overlay: name, type, location */}
        <div className="absolute inset-x-0 bottom-0 z-[1] px-3 pb-3 sm:px-4 sm:pb-4">
          <h2 className="font-[family-name:var(--font-cinzel)] text-base font-semibold leading-tight tracking-wide text-white drop-shadow-sm sm:text-lg">
            {card.displayName}
          </h2>
          <p className="mt-0.5 truncate text-xs text-white/75 sm:text-sm">
            {card.primaryTalentTypeLabel}
            {card.locationLabel ? (
              <>
                <span className="mx-1 text-[var(--impronta-gold)]/60">·</span>
                {card.locationLabel}
              </>
            ) : null}
          </p>
        </div>
      </Link>

      {/* ── Card body ── */}
      <div className="flex flex-col gap-2.5 px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3">
        {/* Fit labels */}
        {fitLabels.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {fitLabels.map((f) => (
              <li
                key={f.slug}
                className="max-w-full truncate rounded-md border border-[var(--impronta-gold-border)] bg-black/25 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--impronta-gold)] sm:text-[10px]"
                title={f.label}
              >
                {f.label}
              </li>
            ))}
          </ul>
        ) : null}

        {/* Filter match explanation (classic) */}
        {card.filterMatchLabels &&
        card.filterMatchLabels.length > 0 &&
        !aiOverlay ? (
          <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
            <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--impronta-muted)]">
              {c.matchWhyPrefix}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-[var(--impronta-foreground)]/90">
              {card.filterMatchLabels.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* AI match explanation (hybrid) */}
        {aiOverlay &&
        (aiOverlay.explanationLines.length > 0 ||
          aiOverlay.confidenceNote ||
          (aiOverlay.vectorSimilarity != null &&
            Number.isFinite(aiOverlay.vectorSimilarity))) ? (
          <div className="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--impronta-muted)]">
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
                className="text-xs text-[var(--impronta-muted)] [&_span]:text-[var(--impronta-foreground)]/90"
                ariaLabel={c.aiMatchWhyAria}
              />
            ) : null}
            {aiOverlay.confidenceNote ? (
              <p className="mt-1 text-[10px] leading-snug text-[var(--impronta-muted)]">
                {aiOverlay.confidenceNote}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Expandable attributes section */}
        {hasDetails ? (
          <div>
            <button
              type="button"
              onClick={() => setDetailsOpen((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-md px-1 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--impronta-muted)] transition-colors hover:text-[var(--impronta-gold)]"
            >
              <span>{detailsOpen ? c.quickPreview : c.quickPreview}</span>
              {detailsOpen ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>

            {detailsOpen ? (
              <div className="mt-1.5 space-y-2.5">
                {gridAttrs.length > 0 ? (
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {gridAttrs.map((attr) => (
                      <div key={attr.key} className="min-w-0">
                        <dt className="text-[8px] font-medium uppercase tracking-[0.16em] text-[var(--impronta-muted)] sm:text-[9px]">
                          {attr.label}
                        </dt>
                        <dd
                          className="mt-0.5 truncate text-xs font-semibold text-[var(--impronta-foreground)] sm:text-sm"
                          title={`${attr.label}: ${attr.value}`}
                        >
                          {attr.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}

                {industries?.value ? (
                  <div>
                    <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-[var(--impronta-muted)] sm:text-[9px]">
                      {industries.label}
                    </p>
                    <p className="mt-0.5 text-xs font-medium leading-relaxed text-[var(--impronta-foreground)] sm:text-sm">
                      {industries.value}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Action row */}
        <div className="flex gap-2">
          <Button
            asChild
            className="h-9 flex-1 rounded-lg bg-[var(--impronta-gold)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--impronta-black)] hover:bg-[var(--impronta-gold-bright)] sm:text-xs"
          >
            <Link href={profileHref}>{c.viewPortfolio}</Link>
          </Button>
          <ContactTalentButton
            talent={{
              id: card.id,
              profileCode: card.profileCode,
              displayName: card.displayName,
            }}
            sourcePage={sourcePage}
            initialSaved={saved}
            variant="outline"
            inquiry={ui.inquiry}
            label={c.inquire}
            className="h-9 shrink-0 rounded-lg border-[var(--impronta-gold-border)] px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--impronta-gold)] hover:border-[var(--impronta-gold)]/50 hover:bg-[var(--impronta-gold)]/10 hover:text-[var(--impronta-gold-bright)] sm:px-3 sm:text-xs"
          />
        </div>

        <span className="sr-only">{formatSrOnlyProfileCode(ui.card, card.profileCode)}</span>
      </div>
    </div>
  );
}
