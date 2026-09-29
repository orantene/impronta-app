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

import { selectionDockCopy, dockSummary } from "./selection-dock-state";

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
  /** The 5s Undo toast: a ✕-remove or a single-select switch, else null. */
  toast: { kind: "removed" | "switched"; name: string } | null;
  onUndo: () => void;
}) {
  const copy = selectionDockCopy(locale);
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
      data-inline={frontHasThumb ? undefined : "true"}
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
        data-show={show && items.length > 0 ? "true" : "false"}
        data-count={items.length}
        aria-hidden={show && items.length > 0 ? undefined : true}
        inert={show && items.length > 0 ? undefined : true}
      >
        {frontHasThumb ? (
          <div className="cb-dock-stack">
            {thumbs.map((t) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={t.id} src={t.imageUrl} alt="" className="cb-dock-th" />
            ))}
            {removeBtn}
            {items.length > 1 ? <span className="cb-dock-count">{items.length}</span> : null}
          </div>
        ) : (
          removeBtn
        )}
        <div className="cb-dock-info">
          <b>{name}</b>
          <span>{line}</span>
        </div>
        <button
          type="button"
          className="cb-dock-ask"
          aria-label={items.length > 1 ? copy.askMany : copy.ask}
          onClick={onAsk}
        >
          <ChatIcon size={20} />
          <span className="cb-dock-dot" aria-hidden />
        </button>
        <button type="button" className="cb-dock-go" onClick={onContinue}>
          {copy.continueLabel} <span className="cb-dock-arr" aria-hidden>→</span>
        </button>
      </div>
      <div className="cb-dock-toast" role="status" data-show={toast ? "true" : "false"}>
        {toast ? (
          <>
            <span>
              {toast.kind === "switched" ? copy.switched(toast.name) : copy.removed(toast.name)}
            </span>
            <button type="button" onClick={onUndo}>
              {copy.undo}
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
