"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AIMatchExplanation } from "@/components/ai/ai-match-explanation";
import { TalentCardAiMatchDrawer } from "@/components/directory/talent-card-ai-match-drawer";
import type { DirectoryAiCardOverlay, DirectoryCardDTO } from "@/lib/directory/types";
import { ContactTalentButton } from "@/components/directory/directory-inquiry-actions";
import { cn } from "@/lib/utils";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { clientLocaleHref } from "@/i18n/client-directory-href";

function talentProfileHref(pathname: string, profileCode: string): string {
  return clientLocaleHref(pathname, `/t/${encodeURIComponent(profileCode)}`);
}

export function TalentDirectoryListRow({
  card,
  saved,
  onSaveToggle,
  onQuickPreview,
  priority,
  sourcePage = "/directory",
  ui,
  aiOverlay = null,
}: {
  card: DirectoryCardDTO;
  saved: boolean;
  onSaveToggle: () => void;
  onQuickPreview: () => void;
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
  return (
    <article
      className={cn(
        "flex gap-4 rounded-2xl border border-white/[0.08] bg-gradient-to-r from-zinc-900/90 to-black/90 p-3 shadow-sm transition-[box-shadow] hover:shadow-md hover:shadow-[var(--impronta-gold)]/10",
      )}
    >
      <Link
        href={profileHref}
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-8 w-8 shrink-0 rounded-full border border-white/10 bg-black/40 text-[var(--impronta-gold)]"
            aria-pressed={saved}
            aria-label={saved ? lc.removeSaveAria : lc.saveAria}
            onClick={(e) => {
              e.preventDefault();
              onSaveToggle();
            }}
          >
            <Bookmark className={cn("size-3.5", saved && "fill-current")} strokeWidth={1.75} />
          </Button>
          <Button
            asChild
            size="sm"
            className="h-8 rounded-lg bg-[var(--impronta-gold)] px-3 text-[10px] font-semibold uppercase tracking-wider text-black hover:bg-[var(--impronta-gold-bright)]"
          >
            <Link href={profileHref}>{lc.view}</Link>
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
            label={lc.inquire}
            className="h-8 shrink-0 rounded-lg border-[var(--impronta-gold-border)] px-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--impronta-gold)]"
          />
          <button
            type="button"
            className="text-[10px] font-medium uppercase tracking-wide text-[var(--impronta-muted)] underline-offset-4 hover:text-[var(--impronta-gold)] hover:underline"
            onClick={onQuickPreview}
          >
            {lc.preview}
          </button>
        </div>
      </div>
    </article>
  );
}
