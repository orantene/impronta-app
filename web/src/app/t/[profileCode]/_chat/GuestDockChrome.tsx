"use client";

/**
 * GuestDockChrome — header + journey progress + Hablar/Servicios/Mis citas nav.
 * Extracted so MiniChatPanelColumn stays under the max-lines cap.
 */

import type { Translator } from "@/i18n/interpolate";
import type { MiniChatBrand } from "@/lib/inquiry/guest-chat-contract";
import type { UnifiedSyncState } from "./use-unified-inquiry";

import type { GuestDockView } from "./guest-dock-view";
import type { GuestHeaderThreadState } from "./guest-thread-state";
import { GuestDockNav } from "./GuestDockNav";
import { GuestJourneyProgress, type JourneySeg } from "./GuestJourneyProgress";
import { GuestPanelHeader } from "./GuestPanelHeader";
import { type Palette, type SurfaceMode } from "./mini-chat-styles";

export type GuestDockChromeProps = {
  brand: MiniChatBrand;
  accent: string;
  accentInk: string;
  talentFirst: string;
  C: Palette;
  surfaceMode?: SurfaceMode;
  threadState: GuestHeaderThreadState;
  journeyLabel: string | null;
  syncState: UnifiedSyncState;
  onRetrySync?: () => void;
  onToggleExpand?: () => void;
  expanded: boolean;
  onOpenSwitcher: (() => void) | null;
  onOpenDetails: (() => void) | null;
  detailsFilled: number;
  detailsTotal: number;
  railLabel: string | null;
  journeySegs: readonly JourneySeg[];
  dockEnabled: boolean;
  activeDockView: GuestDockView;
  onDockViewChange?: (view: GuestDockView) => void;
  lineupCount: number;
  projectsCount: number;
  t: Translator;
  onClose: () => void;
};

export function GuestDockChrome({
  brand,
  accent,
  accentInk,
  talentFirst,
  C,
  surfaceMode,
  threadState,
  journeyLabel,
  syncState,
  onRetrySync,
  onToggleExpand,
  expanded,
  onOpenSwitcher,
  onOpenDetails,
  detailsFilled,
  detailsTotal,
  railLabel,
  journeySegs,
  dockEnabled,
  activeDockView,
  onDockViewChange,
  lineupCount,
  projectsCount,
  t,
  onClose,
}: GuestDockChromeProps) {
  return (
    <>
      <GuestPanelHeader
        brand={brand}
        accent={accent}
        accentInk={accentInk}
        talentFirst={talentFirst}
        C={C}
        surfaceMode={surfaceMode}
        threadState={threadState}
        journeyLabel={journeyLabel}
        syncState={syncState}
        onRetrySync={onRetrySync}
        onToggleExpand={onToggleExpand}
        expanded={expanded}
        onOpenSwitcher={onOpenSwitcher}
        onOpenDetails={onOpenDetails}
        detailsFilled={detailsFilled}
        detailsTotal={detailsTotal}
        railLabel={railLabel}
        t={t}
        onClose={onClose}
      />

      {dockEnabled && journeySegs.length > 0 && railLabel && (
        <GuestJourneyProgress
          segs={journeySegs}
          railLabel={railLabel}
          accent={accent}
          C={C}
          t={t}
          onOpenDetails={onOpenDetails}
        />
      )}

      {dockEnabled && onDockViewChange && (
        <GuestDockNav
          active={activeDockView}
          onChange={onDockViewChange}
          accent={accent}
          C={C}
          t={t}
          lineupCount={lineupCount}
          projectsCount={projectsCount}
          itemsTab={brand.dockItemsTab !== false}
          itemsLabel={brand.dockItemsLabel ?? null}
          projectsLabel={brand.dockProjectsLabel ?? null}
        />
      )}
    </>
  );
}
