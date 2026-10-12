"use client";

/**
 * AUD-044 — frosted selection dock (replaces the "Continuar" selection card).
 *
 * Photo thumb(s) with ✕ on the corner, name + "options · price", a round Ask
 * button (opens the guest chat about the selection) and Continuar (opens the
 * booking sheet, unchanged behavior). While `data-show="true"` the guest chat
 * FAB tucks itself away (see use-yield-booking-bar), so there is only ever one
 * floating control. Styles live in catalog-booking-styles (`.cb-dock*`).
 *
 * E6-tab-count (TUL-534): the dock mounts at the end of the catalog DOM, so
 * after "Seleccionar" Tab would walk ~50 controls before Continuar. On the
 * hidden→shown edge, move focus to Continuar so keyboard guests land on the
 * booking action (≤10 Tabs done-when).
 */

import { useEffect, useRef, useSyncExternalStore } from "react";

import { useEmergenciesToday } from "@/components/talent-site/LiveStatusExpiry";
import type { LiveStatusRenderContext } from "@/lib/talent/live-status-render";

import { peekChatPresence, subscribeChatPresence } from "./chat-presence-store";
import {
  dockSummary,
  dockToastHasUndo,
  dockToastText,
  selectionDockCopy,
  type DockToast,
} from "./selection-dock-state";

export type SelectionDockItem = {
  id: string;
  title: string;
  imageUrl: string | null;
  bits: string | null;
  totalCents: number;
  priceLabel?: string | null;
};

export function ChatIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.1A8.5 8.5 0 1 1 21 12z" />
    </svg>
  );
}

/** Category-neutral service glyph: the thumbnail fallback when a service has no photo. */
function ServiceGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <path d="M18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  );
}

export function SelectionDock({
  items,
  show,
  locale,
  formatPrice,
  onRemoveFront,
  onAsk,
  onContinue,
  toast,
  onUndo,
  liveStatus = null,
}: {
  items: SelectionDockItem[];
  show: boolean;
  locale: string;
  formatPrice: (cents: number) => string;
  onRemoveFront: () => void;
  onAsk: () => void;
  onContinue: () => void;
  /** TO-1: the toast to show (added, updated, removed, switched), else null. */
  toast: DockToast | null;
  onUndo: () => void;
  /**
   * G12: the talent's live status. Only while "emergencias hoy" is on does the
   * action carry a second label (hidden, shown by the utility type system' CSS
   * alone), so every other design and the off state render the original markup.
   */
  liveStatus?: LiveStatusRenderContext | null;
}) {
  const copy = selectionDockCopy(locale);
  const emergenciesOn = useEmergenciesToday(liveStatus);
  // The chat button shows online / unread dots when the chat is live on this page.
  const presence = useSyncExternalStore(subscribeChatPresence, peekChatPresence, () => null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const wasDockShown = useRef(false);
  const front = items[0] ?? null;
  const { name, line } = dockSummary(items, locale, formatPrice);
  const thumbs = items
    .slice(0, 2)
    .filter((i): i is SelectionDockItem & { imageUrl: string } => Boolean(i.imageUrl));
  const frontHasThumb = Boolean(front?.imageUrl);
  const removeBtn = front ? (
    <button
      type="button"
      className="cb-dock-x"
      aria-label={copy.remove(front.title)}
      onClick={onRemoveFront}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  ) : null;

  const dockShown = show && items.length > 0 && !presence?.open;

  useEffect(() => {
    if (dockShown && !wasDockShown.current) {
      continueRef.current?.focus({ preventScroll: true });
    }
    wasDockShown.current = dockShown;
  }, [dockShown]);
  // ONE bar at the bottom: while the dock is up the toast lives INSIDE it
  // (rising from its top edge); only when the dock is gone (Undo after
  // removing the last service) does it stand alone, and then it is the only
  // thing at the bottom.
  const toastEl = (
    <div
      className="cb-dock-toast"
      data-in-dock={dockShown ? "true" : undefined}
      role="status"
      data-show={toast ? "true" : "false"}
      data-kind={toast?.kind}
    >
      {toast ? (
        <>
          <span>{dockToastText(copy, toast)}</span>
          {dockToastHasUndo(toast.kind) ? (
            <button type="button" onClick={onUndo}>
              {copy.undo}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );

  return (
    <>
      <div
        className="cb-dock"
        role="region"
        aria-label={copy.region}
        data-show={dockShown ? "true" : "false"}
        data-count={items.length}
        aria-hidden={dockShown ? undefined : true}
        inert={dockShown ? undefined : true}
      >
        {/* The chat button: always the speech-bubble icon, never a photo (a photo next to the
            selected service reads as the service's image). Dots show online and unread. */}
        <button
          type="button"
          className="cb-dock-ask"
          aria-label={items.length > 1 ? copy.askMany : copy.ask}
          onClick={onAsk}
        >
          <ChatIcon size={20} />
          {presence ? <span className="cb-dock-dot" aria-hidden /> : null}
          {presence?.unread ? <span className="cb-dock-unread" data-dock-unread="" aria-hidden /> : null}
        </button>
        <div className="cb-dock-stack" data-dock-thumb={frontHasThumb ? "photo" : "icon"}>
          {frontHasThumb ? (
            thumbs.map((t) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={t.id} src={t.imageUrl} alt="" className="cb-dock-th" />
            ))
          ) : (
            <span className="cb-dock-th cb-dock-th-icon" aria-hidden>
              <ServiceGlyph size={18} />
            </span>
          )}
          {removeBtn}
          {items.length > 1 ? <span className="cb-dock-count">{items.length}</span> : null}
        </div>
        <div className="cb-dock-info">
          <b>{name}</b>
          <span>{line}</span>
        </div>
        <button type="button" ref={continueRef} className="cb-dock-go" onClick={onContinue}>
          {emergenciesOn ? (
            <>
              <span className="cb-dock-lbl-off">{copy.continueLabel}</span>
              <span className="cb-dock-lbl-on" data-dock-live="on" hidden>{copy.liveLabel}</span>
            </>
          ) : (
            copy.continueLabel
          )}{" "}
          <span className="cb-dock-arr" aria-hidden>→</span>
        </button>
        {dockShown ? toastEl : null}
      </div>
      {dockShown ? null : toastEl}
    </>
  );
}
