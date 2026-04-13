"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback } from "react";
import { Bookmark, Share2, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContactTalentButton } from "@/components/directory/directory-inquiry-actions";
import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import type { DirectoryCardAttributeDTO, DirectoryCardDTO } from "@/lib/directory/types";
import { MAX_CARD_FIT_LABELS } from "@/lib/directory/talent-card-dto";
import { cn } from "@/lib/utils";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import {
  formatCardImageAlt,
  formatShareNativeText,
  formatSrOnlyProfileCode,
} from "@/lib/directory/directory-ui-copy";
import { clientLocaleHref } from "@/i18n/client-directory-href";

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
};

/**
 * Directory card — luxury dark layout aligned with brand mockups: portrait hero, overlays,
 * trait grid from `card_visible` catalog, portfolio + inquire actions.
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
}: TalentCardProps) {
  const pathname = usePathname();
  const { setFlash } = usePublicDiscoveryState();
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
        return;
      } catch {
        /* user dismissed share sheet */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
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
  }, [card, setFlash, c, brand, pathname]);

  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/95 via-[var(--impronta-surface)] to-black shadow-sm transition-[box-shadow,transform] duration-200 hover:shadow-lg hover:shadow-[var(--impronta-gold)]/10",
        className,
      )}
    >
      <div
        className="relative w-full overflow-hidden bg-gradient-to-b from-zinc-800/90 to-zinc-950"
        style={aspectStyle}
      >
        {card.thumbnail.url ? (
          <Image
            src={card.thumbnail.url}
            alt={formatCardImageAlt(c, card.displayName)}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            priority={priority}
          />
        ) : (
          <div
            className="flex h-full min-h-[200px] items-center justify-center font-[family-name:var(--font-cinzel)] text-sm tracking-[0.2em] text-[var(--impronta-muted)]"
            aria-hidden
          >
            {brand}
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent"
          aria-hidden
        />

        {availableLabel ? (
          <div className="absolute left-2.5 top-2.5 z-[1] flex flex-wrap items-center gap-1.5">
            <span className="pointer-events-none rounded-full border border-white/20 bg-black/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--impronta-foreground)]/90 backdrop-blur-sm">
              {availableLabel}
            </span>
          </div>
        ) : null}

        <div className="absolute right-2 top-2 z-[1] flex flex-col gap-1.5">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-9 w-9 rounded-full border border-white/10 bg-black/55 text-[var(--impronta-gold)] backdrop-blur-sm hover:bg-black/70"
            aria-pressed={saved}
            aria-label={saved ? c.removeSaveAria : c.saveAria}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSaveToggle();
            }}
          >
            <Bookmark
              className={cn("size-4", saved && "fill-current")}
              strokeWidth={1.75}
            />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-9 w-9 rounded-full border border-white/10 bg-black/55 text-[var(--impronta-foreground)] backdrop-blur-sm hover:bg-black/70"
            aria-label={c.shareAria}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void shareProfile();
            }}
          >
            <Share2 className="size-4" strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-3.5 pb-4 pt-3 sm:px-4">
        {card.isFeatured ? (
          <div
            className="flex flex-wrap items-center gap-2 text-[var(--impronta-gold)]"
            role="img"
            aria-label={c.featuredAria}
          >
            <span className="flex gap-0.5" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className="size-3 shrink-0 fill-[var(--impronta-gold)] text-[var(--impronta-gold)]"
                  strokeWidth={1.25}
                />
              ))}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--impronta-gold)]">
              {c.featuredLabel}
            </span>
          </div>
        ) : null}

        <div className="space-y-1">
          <h2 className="font-[family-name:var(--font-cinzel)] text-lg font-semibold leading-tight tracking-wide sm:text-xl">
            <Link
              href={profileHref}
              className="block truncate text-[var(--impronta-foreground)] transition-colors hover:text-[var(--impronta-gold)]"
            >
              {card.displayName}
            </Link>
          </h2>
          <p
            className="truncate text-sm italic leading-snug text-[var(--impronta-foreground)]/85"
            title={
              card.locationLabel
                ? c.livesInTitle.replace("{location}", card.locationLabel)
                : undefined
            }
          >
            {card.primaryTalentTypeLabel}
            {card.locationLabel ? (
              <>
                <span className="mx-1.5 not-italic text-[var(--impronta-gold-dim)]">•</span>
                {card.locationLabel}
              </>
            ) : null}
          </p>
        </div>

        {fitLabels.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {fitLabels.map((f) => (
              <li
                key={f.slug}
                className="max-w-full truncate rounded-md border border-[var(--impronta-gold-border)] bg-black/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--impronta-gold)]"
                title={f.label}
              >
                {f.label}
              </li>
            ))}
          </ul>
        ) : null}

        {gridAttrs.length > 0 ? (
          <>
            <div className="border-t border-white/[0.07] pt-3">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                {gridAttrs.map((attr) => (
                  <div key={attr.key} className="min-w-0">
                    <dt className="text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--impronta-muted)]">
                      {attr.label}
                    </dt>
                    <dd
                      className="mt-0.5 truncate text-sm font-semibold text-[var(--impronta-foreground)]"
                      title={`${attr.label}: ${attr.value}`}
                    >
                      {attr.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </>
        ) : null}

        {industries?.value ? (
          <div className="border-t border-white/[0.07] pt-3">
            <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--impronta-muted)]">
              {industries.label}
            </p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--impronta-foreground)]">
              {industries.value}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-white/[0.07] pt-3">
          <div className="flex gap-2">
            <Button
              asChild
              className="h-10 flex-1 rounded-lg bg-[var(--impronta-gold)] text-xs font-semibold uppercase tracking-[0.12em] text-[var(--impronta-black)] hover:bg-[var(--impronta-gold-bright)]"
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
              className="h-10 shrink-0 rounded-lg border-[var(--impronta-gold-border)] px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--impronta-gold)] hover:border-[var(--impronta-gold)]/50 hover:bg-[var(--impronta-gold)]/10 hover:text-[var(--impronta-gold-bright)]"
            />
          </div>
          <button
            type="button"
            className="w-full text-left text-xs font-medium text-[var(--impronta-muted)] underline-offset-4 transition-colors hover:text-[var(--impronta-gold)] hover:underline"
            onClick={onQuickPreview}
          >
            {c.quickPreview}
          </button>
        </div>

        <p className="text-center text-[9px] font-medium uppercase tracking-[0.18em] text-[var(--impronta-muted)]/80">
          {brand} <span className="text-[var(--impronta-gold-dim)]">•</span> {c.footerTalent}{" "}
          <span className="text-[var(--impronta-muted)]">{card.profileCode}</span>
        </p>
        <span className="sr-only">{formatSrOnlyProfileCode(ui.card, card.profileCode)}</span>
      </div>
    </Card>
  );
}
