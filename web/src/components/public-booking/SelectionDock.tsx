"use client";

/**
 * AUD-044 — frosted selection dock (replaces the "Continuar" selection card).
 *
 * Photo thumb(s) with ✕ on the corner, name + "options · price", a round Ask
 * button (opens the guest chat about the selection) and Continuar (opens the
 * booking sheet, unchanged behavior). While `data-show="true"` the guest chat
 * FAB tucks itself away (see use-yield-booking-bar), so there is only ever one
 * floating control. Styles live in catalog-booking-styles (`.cb-dock*`).
 */

import { useSyncExternalStore } from "react";

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
}) {
  const copy = selectionDockCopy(locale);
  // The chat button shows online / unread dots when the chat is live on this page.
  const presence = useSyncExternalStore(subscribeChatPresence, peekChatPresence, () => null);
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

  return (
    <>
      <div
        className="cb-dock"
        role="region"
        aria-label={copy.region}
        data-show={show && items.length > 0 && !presence?.open ? "true" : "false"}
        data-count={items.length}
        aria-hidden={show && items.length > 0 && !presence?.open ? undefined : true}
        inert={show && items.length > 0 && !presence?.open ? undefined : true}
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
        <button type="button" className="cb-dock-go" onClick={onContinue}>
          {copy.continueLabel} <span className="cb-dock-arr" aria-hidden>→</span>
        </button>
      </div>
      <div className="cb-dock-toast" role="status" data-show={toast ? "true" : "false"} data-kind={toast?.kind}>
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
    </>
  );
}
