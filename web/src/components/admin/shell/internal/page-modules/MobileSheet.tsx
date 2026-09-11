"use client";

/**
 * The phone's bottom sheet, as every MW board draws it: a scrim, a white
 * panel with 20px top corners, the grabber, a 16px title, a scrolling body
 * with 18px sides and 10px between blocks, and a footer whose buttons are
 * 50px tall and full width, the decisive one first.
 *
 * `role="dialog"` with `aria-modal`, Escape closes, focus lands on the panel.
 * Renders nothing when closed. Token classes only.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";

export const MOBILE_BUTTON =
  "inline-flex h-[50px] w-full cursor-pointer items-center justify-center gap-[6px] whitespace-nowrap rounded-[12px] border px-[14px] font-admin-body text-admin-15 font-semibold no-underline disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
export const MOBILE_BUTTON_PRIMARY = `${MOBILE_BUTTON} border-admin-brand bg-admin-brand text-white`;
export const MOBILE_BUTTON_SECONDARY = `${MOBILE_BUTTON} border-admin-border bg-admin-card text-admin-ink`;

export function MobileSheet({
  open,
  title,
  onClose,
  closeLabel,
  children,
  footer,
  name,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  /** A test hook: `data-mobile-sheet="<name>"`. */
  name: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[210] flex items-end justify-center font-admin-body" data-mobile-sheet-overlay>
      <button type="button" aria-label={closeLabel} tabIndex={-1} onClick={onClose} className="absolute inset-0 border-0 bg-admin-ink/35" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-mobile-sheet={name}
        className="relative flex max-h-[86vh] w-full flex-col overflow-hidden rounded-t-[20px] bg-admin-card shadow-[0_-20px_50px_-30px_rgba(0,0,0,0.5)] outline-none"
      >
        <div className="flex justify-center pt-[8px]">
          <span aria-hidden className="h-[4px] w-[38px] rounded-full bg-admin-border-strong" />
        </div>
        <h2 id={titleId} className="m-0 px-[18px] pb-[8px] pt-[10px] text-[16px]! font-semibold text-admin-ink">
          {title}
        </h2>
        <div className="flex min-h-0 flex-1 flex-col gap-[10px] overflow-y-auto px-[18px] pb-[12px]">{children}</div>
        {footer ? (
          <div className="flex flex-col gap-[8px] border-t border-admin-border-soft px-[18px] pb-[max(26px,env(safe-area-inset-bottom))] pt-[12px]">
            {footer}
          </div>
        ) : (
          <div className="h-[max(14px,env(safe-area-inset-bottom))]" />
        )}
      </div>
    </div>
  );
}

/** The board's white list card: rows with a hairline between them. */
export function MobileCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[14px] border border-admin-border bg-admin-card ${className ?? ""}`}>{children}</div>
  );
}

/** The 11px uppercase eyebrow over a card. */
export function MobileEyebrow({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-admin-ink-muted">{children}</div>;
}

/** One row of a card: a title, a second line, and a trailing pill or chevron. */
export function MobileRow({
  title,
  detail,
  trailing,
  onClick,
  href,
  disabled,
  disabledReason,
}: {
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-semibold leading-[1.3] text-admin-ink">{title}</div>
        {detail ? <div className="mt-[2px] text-admin-12h leading-[1.35] text-admin-ink-muted">{detail}</div> : null}
      </div>
      {trailing}
    </>
  );
  const cls =
    "flex w-full items-center gap-[10px] border-t border-admin-border-soft px-[14px] py-[12px] text-left first:border-t-0 no-underline";
  if (href && !disabled) {
    return (
      <a href={href} className={cls}>
        {body}
      </a>
    );
  }
  if (onClick || disabled) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        className={`${cls} cursor-pointer border-x-0 border-b-0 bg-transparent disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** The chevron a row that opens something carries on its right. */
export function MobileChevron() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-admin-ink-dim">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export type MobilePillTone = "red" | "coral" | "slate" | "indigo" | "green" | "royal" | "brand";

const PILL_TONE: Record<MobilePillTone, string> = {
  red: "bg-admin-critical-soft text-admin-red",
  coral: "bg-admin-coral-soft text-admin-coral-deep",
  slate: "bg-admin-amber-soft text-admin-amber",
  indigo: "bg-admin-indigo-soft text-admin-indigo",
  green: "bg-admin-success-soft text-admin-green",
  royal: "bg-admin-royal-soft text-admin-royal",
  brand: "bg-admin-brand-soft text-admin-brand",
};

export function MobilePill({ tone, children }: { tone: MobilePillTone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full px-[8px] py-[2px] text-[11px] font-semibold ${PILL_TONE[tone]}`}>
      {children}
    </span>
  );
}

/** The grey note with an icon: "Switching location changes what Today shows." */
export function MobileNote({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "indigo" | "coral" }) {
  const cls =
    tone === "indigo"
      ? "bg-admin-indigo-soft text-admin-indigo"
      : tone === "coral"
        ? "bg-admin-coral-soft text-admin-coral-deep"
        : "bg-admin-amber-soft text-admin-amber";
  return (
    <div className={`flex items-start gap-[8px] rounded-[10px] px-[12px] py-[10px] text-admin-12h leading-[1.45] ${cls}`}>
      <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="mt-[2px] shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M11 12h1v4h1" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

/** The scrolling chip strip under a title (Overview · Activity · Bookings …). */
export function MobileChips({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="relative">
      <nav aria-label={label} className="flex gap-[6px] overflow-x-auto pr-[28px] [scrollbar-width:none]">
        {children}
      </nav>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[36px] bg-[linear-gradient(90deg,transparent,var(--color-admin-surface)_70%)]" />
    </div>
  );
}

export function MobileChip({
  active,
  children,
  onClick,
  href,
  disabled,
  disabledReason,
}: {
  active: boolean;
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const cls = `shrink-0 whitespace-nowrap rounded-full border px-[12px] py-[7px] text-admin-13 font-semibold no-underline ${
    active ? "border-admin-ink bg-admin-ink text-white" : "border-admin-border bg-admin-card text-admin-ink-muted"
  } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`;
  if (href && !disabled) {
    return (
      <a href={href} aria-current={active ? "page" : undefined} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={disabled ? disabledReason : undefined} aria-pressed={active} className={cls}>
      {children}
    </button>
  );
}

/** The fixed action bar above the tab bar (MW03, MW06, MW10, MW14, MW18, MW22). */
export function MobileActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden className="hidden h-[80px] max-[720px]:block" />
      <div
        data-tulala-mobile-action-bar
        className="fixed inset-x-0 bottom-[calc(62px+env(safe-area-inset-bottom,0px))] z-[60] hidden flex-col gap-[8px] border-t border-admin-border-soft bg-admin-surface px-[14px] py-[10px] max-[720px]:flex"
      >
        {children}
      </div>
    </>
  );
}
