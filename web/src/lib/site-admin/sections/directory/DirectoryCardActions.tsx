"use client";

import { Component, type ReactNode } from "react";
import { Bookmark } from "lucide-react";

import { usePublicDiscoveryState } from "@/components/directory/public-discovery-state";
import { ContactTalentButton } from "@/components/directory/directory-inquiry-actions";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

/**
 * Optional interactive overlay (Save + Add-to-inquiry) for the directory
 * card.
 *
 * `DirectoryCard` stays a PURE prop-driven component (RP-1 / T2 reuse).
 * Interactivity lives here, rendered as a sibling overlay *outside* the
 * card's <Link> (no nested-interactive). Both `usePublicDiscoveryState`
 * (Save) and `ContactTalentButton` throw without the public-discovery
 * provider — so the whole thing is wrapped in a silent boundary: live on
 * /directory (DiscoveryStateBridge mounted), inert in the builder editor
 * preview / T2 (no provider) instead of crashing. Cool-not-warm, zero
 * gold tokens.
 */

class SilentBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function SaveButton({
  talentId,
  saveLabel,
  removeLabel,
}: {
  talentId: string;
  saveLabel: string;
  removeLabel: string;
}) {
  const { isSaved, setSavedState } = usePublicDiscoveryState();
  const saved = isSaved(talentId);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? removeLabel : saveLabel}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setSavedState(talentId, !saved);
      }}
      className="flex size-8 items-center justify-center rounded-full border border-border bg-background/80 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
    >
      <Bookmark
        className={`size-3.5 ${saved ? "fill-current" : ""}`}
        strokeWidth={1.75}
      />
    </button>
  );
}

export type DirectoryCardActionsProps = {
  talentId: string;
  showSave?: boolean;
  saveLabel?: string;
  removeLabel?: string;
  /** When provided (with talent), renders the add-to-inquiry control. */
  inquiry?: DirectoryUiCopy["inquiry"];
  talent?: { id: string; profileCode: string; displayName: string };
  sourcePage?: string;
};

export function DirectoryCardActions({
  talentId,
  showSave = true,
  saveLabel = "Save",
  removeLabel = "Remove from saved",
  inquiry,
  talent,
  sourcePage = "/directory",
}: DirectoryCardActionsProps) {
  const showInquiry = Boolean(inquiry && talent && talent.profileCode);
  if (!showSave && !showInquiry) return null;
  return (
    <SilentBoundary>
      <div className="flex flex-col items-end gap-1.5">
        {showSave ? (
          <SaveButton
            talentId={talentId}
            saveLabel={saveLabel}
            removeLabel={removeLabel}
          />
        ) : null}
        {showInquiry && inquiry && talent ? (
          <ContactTalentButton
            talent={talent}
            sourcePage={sourcePage}
            inquiry={inquiry}
            variant="secondary"
            label={inquiry.contactAboutTalent}
            className="h-8 rounded-full px-3 text-[11px] font-medium backdrop-blur-sm"
          />
        ) : null}
      </div>
    </SilentBoundary>
  );
}
