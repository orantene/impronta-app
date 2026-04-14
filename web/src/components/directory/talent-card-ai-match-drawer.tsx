"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

import { AIDrawer } from "@/components/ai/ai-drawer";
import { AIMatchExplanation } from "@/components/ai/ai-match-explanation";
import type { DirectoryAiCardOverlay } from "@/lib/directory/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Copy = {
  openDetailsAria: string;
  drawerTitle: string;
  drawerDescription: string;
  vectorScoreLabel: string;
  matchWhyAria: string;
};

export function TalentCardAiMatchDrawer({
  displayName,
  overlay,
  copy,
  className,
}: {
  displayName: string;
  overlay: DirectoryAiCardOverlay;
  copy: Copy;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const has =
    overlay.explanationLines.length > 0 ||
    Boolean(overlay.confidenceNote?.trim()) ||
    (overlay.vectorSimilarity != null && Number.isFinite(overlay.vectorSimilarity));
  if (!has) return null;

  const scoreText =
    overlay.vectorSimilarity != null && Number.isFinite(overlay.vectorSimilarity)
      ? copy.vectorScoreLabel.replace(
          "{score}",
          overlay.vectorSimilarity.toFixed(4),
        )
      : null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 shrink-0 text-[var(--impronta-gold)] hover:bg-white/5 hover:text-[var(--impronta-gold-bright)]",
          className,
        )}
        aria-label={copy.openDetailsAria}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Sparkles className="size-4" aria-hidden />
      </Button>
      <AIDrawer
        open={open}
        onOpenChange={setOpen}
        title={copy.drawerTitle}
        description={`${copy.drawerDescription}: ${displayName}`}
      >
        <div className="space-y-4 text-sm">
          {scoreText ? (
            <p className="font-mono text-xs text-muted-foreground">{scoreText}</p>
          ) : null}
          {overlay.explanationLines.length > 0 ? (
            <AIMatchExplanation
              items={overlay.explanationLines}
              ariaLabel={copy.matchWhyAria}
            />
          ) : null}
          {overlay.confidenceNote ? (
            <p className="text-xs text-muted-foreground">{overlay.confidenceNote}</p>
          ) : null}
        </div>
      </AIDrawer>
    </>
  );
}
