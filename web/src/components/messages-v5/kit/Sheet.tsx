"use client";

/**
 * Sheet: the desktop right sheet (520 / 560 / 600 wide) and the mobile bottom
 * sheet (h60 / h92) or full screen. Title, close, drag handle on mobile,
 * scrollable body, sticky footer with safe-area padding. Boards D05, D06,
 * D07, M03, M04, M05. The scrim is a button so a tap outside closes it.
 */

import { useEffect, type ReactNode } from "react";

import type { KitCopy } from "./copy";
import { Avatar, Icon } from "./primitives";

export type SheetVariant = "desktop" | "mobile-h60" | "mobile-h92" | "mobile-full";

export type SheetProps = {
  readonly open: boolean;
  readonly title: string;
  readonly copy: KitCopy;
  readonly onClose: () => void;
  readonly variant?: SheetVariant;
  /** Desktop width. */
  readonly width?: 520 | 560 | 600;
  readonly subtitle?: string;
  readonly avatarName?: string | null;
  /** Extra header content (version switcher, etc). */
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly hint?: string;
  /** Mobile: body without padding, for full-bleed rows. */
  readonly tight?: boolean;
  readonly children?: ReactNode;
  readonly labelledBy?: string;
};

export function Sheet({ open, title, copy, onClose, variant = "desktop", width = 520, subtitle, avatarName, header, footer, hint, tight, children, labelledBy }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const titleId = labelledBy ?? `msgv5-sheet-${title.replace(/\W+/g, "-").toLowerCase()}`;

  if (variant === "mobile-full") {
    return (
      <div className="mx-full" role="dialog" aria-modal="true" aria-labelledby={titleId} data-sheet="full">
        <div className="fh">
          <button type="button" className="close" onClick={onClose} aria-label={copy.sheet.close}>
            <Icon name="x" size={20} />
          </button>
          <div className="tx">
            <b id={titleId}>{title}</b>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          {header}
        </div>
        <div className="fb">{children}</div>
        {footer ? <div className="ff">{footer}</div> : null}
      </div>
    );
  }

  if (variant === "mobile-h60" || variant === "mobile-h92") {
    return (
      <>
        <button type="button" className="scrim" aria-label={copy.sheet.close} onClick={onClose} />
        <div className={`mx-sheet ${variant === "mobile-h60" ? "h60" : "h92"}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-sheet={variant}>
          <div className="grab" aria-hidden="true" title={copy.sheet.dragHandle} />
          <div className="sh">
            {avatarName !== undefined ? <Avatar name={avatarName} size="sm" /> : null}
            <h3 id={titleId}>{title}</h3>
            {header}
            <button type="button" className="close" onClick={onClose} aria-label={copy.sheet.close}>
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className={`sb${tight ? " tight" : ""}`}>{children}</div>
          {footer ? <div className="sf">{footer}</div> : null}
        </div>
      </>
    );
  }

  return (
    <>
      <button type="button" className="scrim" aria-label={copy.sheet.close} onClick={onClose} />
      <div className={`sheet${width === 560 ? " w560" : width === 600 ? " w600" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-sheet="desktop">
        <div className="sh">
          {avatarName !== undefined ? <Avatar name={avatarName} size="sm" /> : null}
          <h3 id={titleId}>{title}</h3>
          {header}
          <button type="button" className="x" onClick={onClose} aria-label={copy.sheet.close}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="sb">{children}</div>
        {footer || hint ? (
          <div className="sf">
            {hint ? <span className="hint">{hint}</span> : null}
            {footer}
          </div>
        ) : null}
      </div>
    </>
  );
}
