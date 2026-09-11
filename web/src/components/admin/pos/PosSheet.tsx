"use client";

/**
 * PosSheet + PosDialog — the two overlays every counter board uses.
 *
 * `PosSheet` is the 600px panel that slides in from the right over a dimmed
 * counter (`POSLineEdit`, `POSCustomer`, `POSDiscount`, `POSCustomAmount`):
 * a header with title, subtitle, optional breadcrumb and a 44px close, a
 * scrolling body, and a footer with `Cancel` on the left and the actions on
 * the right.
 *
 * `PosDialog` is the 520px centred card (`POSHoldSale`, `POSHoldExpired`,
 * `POSManagerApproval`, `POSCashDone`): same header, a body, a footer.
 *
 * Both are `role="dialog"` with `aria-modal`, close on Escape, and put focus
 * on the close button when they open. They render nothing when `open` is
 * false, so the counter under them keeps its DOM exactly as it was.
 */

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

import { cn } from "@/lib/utils";
import { POS_CLOSE_ACTION } from "./pos-classes";

type OverlayProps = {
  readonly open: boolean;
  readonly title: string;
  readonly subtitle?: string;
  /** `Customer › New` above the title. */
  readonly crumb?: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Left-aligned footer slot (`Cancel`, `Back`). */
  readonly footerStart?: ReactNode;
  /** Right-aligned footer slot (the primary action and its neighbours). */
  readonly footerEnd?: ReactNode;
  /** A test hook: `data-pos-sheet="line-edit"`. */
  readonly name: string;
  readonly className?: string;
};

function useOverlay(open: boolean, onClose: () => void) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return closeRef;
}

function OverlayHeader({
  title,
  subtitle,
  crumb,
  closeLabel,
  onClose,
  titleId,
  closeRef,
}: Pick<OverlayProps, "title" | "subtitle" | "crumb" | "closeLabel" | "onClose"> & {
  titleId: string;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="flex shrink-0 items-start gap-4 border-b border-admin-border px-6 pb-4 pt-5">
      <div className="min-w-0 flex-1">
        {crumb && <p className="m-0 mb-1 text-[13px] text-admin-ink-muted">{crumb}</p>}
        <h2 id={titleId} className="m-0 text-[20px] font-semibold leading-[1.2] tracking-[-0.01em] text-admin-ink">
          {title}
        </h2>
        {subtitle && <p className="m-0 mt-0.5 text-[14px] text-admin-ink-muted">{subtitle}</p>}
      </div>
      <button ref={closeRef} type="button" aria-label={closeLabel} onClick={onClose} className={POS_CLOSE_ACTION}>
        <X aria-hidden size={18} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function OverlayFooter({ footerStart, footerEnd }: Pick<OverlayProps, "footerStart" | "footerEnd">) {
  if (!footerStart && !footerEnd) return null;
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-admin-border px-6 py-4">
      <div className="flex items-center gap-3">{footerStart}</div>
      <div className="flex-1" />
      <div className="flex items-center gap-3">{footerEnd}</div>
    </div>
  );
}

export function PosSheet(props: OverlayProps) {
  const titleId = useId();
  const closeRef = useOverlay(props.open, props.onClose);
  if (!props.open) return null;
  return (
    <div className="absolute inset-0 z-20 flex justify-end" data-pos-overlay>
      <button
        type="button"
        aria-label={props.closeLabel}
        tabIndex={-1}
        onClick={props.onClose}
        className="absolute inset-0 bg-admin-ink/45"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-pos-sheet={props.name}
        className={cn("relative flex h-full w-[600px] max-w-full flex-col bg-admin-card shadow-admin-hover", props.className)}
      >
        <OverlayHeader
          title={props.title}
          subtitle={props.subtitle}
          crumb={props.crumb}
          closeLabel={props.closeLabel}
          onClose={props.onClose}
          titleId={titleId}
          closeRef={closeRef}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{props.children}</div>
        <OverlayFooter footerStart={props.footerStart} footerEnd={props.footerEnd} />
      </section>
    </div>
  );
}

export function PosDialog(props: OverlayProps) {
  const titleId = useId();
  const closeRef = useOverlay(props.open, props.onClose);
  if (!props.open) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center pt-12" data-pos-overlay>
      <button
        type="button"
        aria-label={props.closeLabel}
        tabIndex={-1}
        onClick={props.onClose}
        className="absolute inset-0 bg-admin-ink/45"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-pos-dialog={props.name}
        className={cn(
          "relative flex max-h-[calc(100%-4rem)] w-[520px] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-[20px] bg-admin-card shadow-admin-hover",
          props.className,
        )}
      >
        <OverlayHeader
          title={props.title}
          subtitle={props.subtitle}
          crumb={props.crumb}
          closeLabel={props.closeLabel}
          onClose={props.onClose}
          titleId={titleId}
          closeRef={closeRef}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{props.children}</div>
        <OverlayFooter footerStart={props.footerStart} footerEnd={props.footerEnd} />
      </section>
    </div>
  );
}
