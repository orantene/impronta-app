"use client";

/**
 * GuestDockChrome — header + journey progress + Hablar/Servicios/Mis citas nav.
 * Extracted so MiniChatPanelColumn stays under the max-lines cap.
 */

import type { Translator } from "@/i18n/interpolate";
import type { MiniChatBrand } from "@/lib/inquiry/guest-chat-contract";
import type { ChatCardConfig } from "@/lib/talent-site/chat-card";
import type { UnifiedSyncState } from "./use-unified-inquiry";

import type { GuestDockView } from "./guest-dock-view";
import type { GuestHeaderThreadState } from "./guest-thread-state";
import { CardDockHeader } from "./CardDockHeader";
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
  /** Card skin (`chat.variant = card`): header with round icon buttons. */
  card?: ChatCardConfig | null;
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
  card = null,
}: GuestDockChromeProps) {
  const cardNavLabel = card ? t("public.guestChat.cardTabServices") : null;
  return (
    <>
      {card ? (
        <CardDockHeader
          brand={brand}
          card={card}
          t={t}
          activeView={activeDockView}
          onViewChange={dockEnabled ? onDockViewChange : undefined}
          showServices={brand.dockItemsTab !== false || card.browseServices}
          servicesCount={lineupCount}
          projectsCount={projectsCount}
          threadState={threadState}
          syncState={syncState}
          onRetrySync={onRetrySync}
          onOpenSwitcher={onOpenSwitcher}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          onClose={onClose}
        />
      ) : (
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
      )}

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

      {dockEnabled && onDockViewChange && (!card || (activeDockView !== "chat" && activeDockView !== "home")) && (
        <GuestDockNav
          active={activeDockView}
          onChange={onDockViewChange}
          accent={accent}
          C={C}
          t={t}
          lineupCount={lineupCount}
          projectsCount={projectsCount}
          itemsTab={card ? brand.dockItemsTab !== false || card.browseServices : brand.dockItemsTab !== false}
          itemsLabel={cardNavLabel ?? brand.dockItemsLabel ?? null}
          projectsLabel={brand.dockProjectsLabel ?? null}
        />
      )}
    </>
  );
}
